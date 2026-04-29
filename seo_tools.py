#!/usr/bin/env python3
"""
seo_tools.py — Eina d'auditoria i millora SEO per a Alma Bar Restaurant
=========================================================================
Ús:
    python seo_tools.py              # Auditoria completa de tots els HTML
    python seo_tools.py --fix        # Aplica correccions automàtiques
    python seo_tools.py --sitemap    # Regenera sitemap.xml
    python seo_tools.py --report     # Genera informe HTML

Requisits: Python 3.8+  (sense dependències externes)
"""

import os
import re
import sys
import json
import html
import hashlib
from pathlib import Path
from datetime import datetime
from html.parser import HTMLParser
from urllib.parse import urljoin
from collections import defaultdict


# ── Configuració ─────────────────────���────────────────────────────────────────
BASE_DIR   = Path(__file__).parent
DOMAIN     = "https://www.almabarrestaurant.com"
HTML_FILES = {
    "index.html": {"lang": "ca", "hreflang": "ca",    "canonical": "/"},
    "es.html":    {"lang": "es", "hreflang": "es",    "canonical": "/es.html"},
    "fr.html":    {"lang": "fr", "hreflang": "fr",    "canonical": "/fr.html"},
    "en.html":    {"lang": "en", "hreflang": "en",    "canonical": "/en.html"},
    "pt.html":    {"lang": "pt", "hreflang": "pt",    "canonical": "/pt.html"},
}
META_DESC_MIN = 120
META_DESC_MAX = 160
TITLE_MIN     = 30
TITLE_MAX     = 65


# ── Colors ANSI per a terminal ──────────────────────────────���──────────────────
class C:
    RED    = "\033[91m"
    GREEN  = "\033[92m"
    YELLOW = "\033[93m"
    BLUE   = "\033[94m"
    BOLD   = "\033[1m"
    RESET  = "\033[0m"
    CYAN   = "\033[96m"

def ok(msg):    print(f"  {C.GREEN}✔{C.RESET}  {msg}")
def warn(msg):  print(f"  {C.YELLOW}⚠{C.RESET}  {msg}")
def err(msg):   print(f"  {C.RED}✖{C.RESET}  {msg}")
def info(msg):  print(f"  {C.BLUE}ℹ{C.RESET}  {msg}")
def head(msg):  print(f"\n{C.BOLD}{C.CYAN}{'─'*60}{C.RESET}\n{C.BOLD}  {msg}{C.RESET}\n{'─'*60}")


# ── Parser HTML lleuger ──────────────────────────────���─────────────────────────
class SEOParser(HTMLParser):
    """Extreu metadades SEO d'un fitxer HTML."""

    def __init__(self):
        super().__init__()
        self.title        = ""
        self.description  = ""
        self.keywords     = ""
        self.canonical    = ""
        self.og           = {}
        self.twitter      = {}
        self.hreflang     = []
        self.h_tags       = defaultdict(list)   # {1: ["Títol"], 2: [...], ...}
        self.images       = []                  # [{src, alt}]
        self.links        = []                  # [{href, title, text}]
        self.buttons      = []                  # [text]
        self.schema_types = []
        self.robots       = ""
        self._in_title    = False
        self._in_script   = False
        self._script_type = ""
        self._script_buf  = ""
        self._current_h   = None
        self._current_h_text = ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        t = tag.lower()

        if t == "title":
            self._in_title = True

        elif t == "meta":
            name = a.get("name", "").lower()
            prop = a.get("property", "").lower()
            content = a.get("content", "")
            if name == "description":          self.description = content
            elif name == "keywords":           self.keywords    = content
            elif name == "robots":             self.robots      = content
            elif prop == "og:title":           self.og["title"]       = content
            elif prop == "og:description":     self.og["description"] = content
            elif prop == "og:image":           self.og["image"]       = content
            elif prop == "og:url":             self.og["url"]         = content
            elif prop == "og:type":            self.og["type"]        = content
            elif prop.startswith("twitter:"):  self.twitter[prop[8:]] = content

        elif t == "link":
            rel  = a.get("rel", "").lower()
            href = a.get("href", "")
            if rel == "canonical":
                self.canonical = href
            elif rel == "alternate" and "hreflang" in a:
                self.hreflang.append({"hreflang": a["hreflang"], "href": href})

        elif t == "img":
            self.images.append({
                "src": a.get("src", ""),
                "alt": a.get("alt", ""),
            })

        elif t == "a":
            self.links.append({
                "href":  a.get("href", ""),
                "title": a.get("title", ""),
                "text":  "",
            })

        elif t == "button":
            self.buttons.append({"text": "", "_idx": len(self.buttons)})

        elif t in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._current_h = int(t[1])
            self._current_h_text = ""

        elif t == "script":
            stype = a.get("type", "")
            if stype == "application/ld+json":
                self._in_script  = True
                self._script_type = "json-ld"
                self._script_buf  = ""

    def handle_endtag(self, tag):
        t = tag.lower()
        if t == "title":
            self._in_title = False
        elif t == "script" and self._in_script:
            self._in_script = False
            try:
                data = json.loads(self._script_buf)
                stype = data.get("@type", "")
                if stype:
                    self.schema_types.append(stype)
            except json.JSONDecodeError:
                pass
            self._script_buf = ""
        elif t in ("h1","h2","h3","h4","h5","h6") and self._current_h:
            self.h_tags[self._current_h].append(self._current_h_text.strip())
            self._current_h = None

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._in_script:
            self._script_buf += data
        if self._current_h is not None:
            self._current_h_text += data
        # Últim link i button: afegir text
        if self.links:
            self.links[-1]["text"] += data.strip()
        if self.buttons:
            self.buttons[-1]["text"] = self.buttons[-1].get("text","") + data.strip()


# ── Funcions d'auditoria ───────────────────────────────���──────────────────────���
def audit_file(filepath: Path, config: dict) -> dict:
    """Analitza un fitxer HTML i retorna un diccionari d'incidències."""
    content  = filepath.read_text(encoding="utf-8")
    parser   = SEOParser()
    parser.feed(content)
    issues   = {"errors": [], "warnings": [], "ok": []}

    def add_ok(msg):   issues["ok"].append(msg)
    def add_warn(msg): issues["warnings"].append(msg)
    def add_err(msg):  issues["errors"].append(msg)

    # ── Títol ────────────��──────────────────────────────────��──────────────────
    title = parser.title.strip()
    tlen  = len(title)
    if not title:
        add_err("Sense <title>")
    elif tlen < TITLE_MIN:
        add_warn(f"Títol massa curt ({tlen} car.) — mínim {TITLE_MIN}")
    elif tlen > TITLE_MAX:
        add_warn(f"Títol massa llarg ({tlen} car.) — màxim {TITLE_MAX}: «{title[:50]}…»")
    else:
        add_ok(f"Títol OK ({tlen} car.): «{title[:60]}»")

    # ── Meta description ──────────────────────────��────────────────────────────
    desc = parser.description.strip()
    dlen = len(desc)
    if not desc:
        add_err("Sense meta description")
    elif dlen < META_DESC_MIN:
        add_warn(f"Meta description massa curta ({dlen} car.) — mínim {META_DESC_MIN}")
    elif dlen > META_DESC_MAX:
        add_warn(f"Meta description massa llarga ({dlen} car.) — màxim {META_DESC_MAX}: «{desc[:60]}…»")
    else:
        add_ok(f"Meta description OK ({dlen} car.)")

    # ── Canonical ──────────────────────────���────────────────────────────���─────
    expected_canonical = DOMAIN + config["canonical"]
    if not parser.canonical:
        add_err("Sense <link rel=canonical>")
    elif parser.canonical != expected_canonical:
        add_warn(f"Canonical no coincideix: trobat «{parser.canonical}», esperat «{expected_canonical}»")
    else:
        add_ok("Canonical correcte")

    # ── Open Graph ────────────────���──────────────────────────────���─────────────
    for og_key in ("title", "description", "image", "url", "type"):
        if og_key not in parser.og:
            add_warn(f"Manca og:{og_key}")
        else:
            add_ok(f"og:{og_key} present")

    # ── Twitter Card ──────────────────────────────────────────────────────────
    if "card" not in parser.twitter:
        add_warn("Manca meta twitter:card")
    else:
        add_ok("Twitter Card present")

    # ── hreflang ──────────────────────────────────────────────────────────────
    hreflang_codes = {h["hreflang"] for h in parser.hreflang}
    expected_langs = {"ca", "es", "fr", "en", "pt", "x-default"}
    missing_langs  = expected_langs - hreflang_codes
    if missing_langs:
        add_warn(f"hreflang manquen: {', '.join(sorted(missing_langs))}")
    else:
        add_ok("Tots els hreflang presents")

    # ── Structured Data ───────────────────���───────────────────────────────────
    if "Restaurant" in parser.schema_types:
        add_ok("Schema.org Restaurant present")
    else:
        add_err("Manca JSON-LD amb @type Restaurant")

    # ── H1 ────────────────────────────────────────────────────────────────────
    h1s = parser.h_tags.get(1, [])
    if not h1s:
        add_err("Sense tag <h1>")
    elif len(h1s) > 1:
        add_warn(f"Múltiples <h1> ({len(h1s)}): {h1s}")
    else:
        add_ok(f"<h1> únic: «{h1s[0][:50]}»")

    # ── Imatges sense alt ─────────────────────────���───────────────────────────
    imgs_no_alt = [i["src"] for i in parser.images if not i["alt"].strip()]
    if imgs_no_alt:
        add_warn(f"{len(imgs_no_alt)} imatge(s) sense alt: {imgs_no_alt[:3]}")
    else:
        add_ok(f"Totes les imatges ({len(parser.images)}) tenen alt")

    # ── Botons residuals (hauria de ser <a>) ───────────────────���──────────────
    nav_btns = [b for b in parser.buttons
                if any(k in b.get("text","").lower()
                       for k in ("reserv","book","réserv","contact","whats","ver","veure","voir","view"))]
    if nav_btns:
        add_warn(f"{len(nav_btns)} botó(ns) de navegació com <button> (hauria de ser <a>): "
                 f"{[b['text'][:30] for b in nav_btns]}")
    else:
        add_ok("Cap botó de navegació com <button> detectat")

    # ── Links sense title ─────────────────────��───────────────────────���───────
    links_no_title = [l for l in parser.links
                      if l["href"] and not l["title"] and not l["href"].startswith("tel:")
                      and not l["href"].startswith("mailto:") and l["href"] != "#"]
    if links_no_title:
        n = len(links_no_title)
        add_warn(f"{n} enllaç(os) sense atribut title (primers 3: "
                 f"{[l['href'][:40] for l in links_no_title[:3]]})")
    else:
        add_ok("Tots els enllaços rellevants tenen title")

    # ── Robots ────────────────────────────────────────────────────────────────
    if "noindex" in parser.robots.lower():
        add_err("Meta robots conté noindex — la pàgina no s'indexarà!")
    elif parser.robots:
        add_ok(f"Meta robots: {parser.robots}")
    else:
        add_warn("Sense meta robots (per defecte Google indexa)")

    return issues


def print_audit(filename: str, issues: dict):
    total_err  = len(issues["errors"])
    total_warn = len(issues["warnings"])
    total_ok   = len(issues["ok"])
    status = C.RED + "ERRORS" if total_err else (C.YELLOW + "AVÍS" if total_warn else C.GREEN + "OK")
    head(f"{filename}  [{status}{C.RESET}{C.BOLD}]  "
         f"✖{total_err}  ⚠{total_warn}  ✔{total_ok}")
    for msg in issues["errors"]:   err(msg)
    for msg in issues["warnings"]: warn(msg)
    for msg in issues["ok"]:       ok(msg)


# ── Generació de sitemap.xml ──────────────────────────────────────────────────
def generate_sitemap():
    today = datetime.now().strftime("%Y-%m-%d")
    pages = [
        {"url": "/",        "lang": "ca", "priority": "1.0"},
        {"url": "/es.html", "lang": "es", "priority": "0.9"},
        {"url": "/fr.html", "lang": "fr", "priority": "0.9"},
        {"url": "/en.html", "lang": "en", "priority": "0.9"},
        {"url": "/pt.html", "lang": "pt", "priority": "0.9"},
    ]
    alternates_block = "\n".join(
        f'    <xhtml:link rel="alternate" hreflang="{p["lang"]}" href="{DOMAIN}{p["url"]}"/>'
        for p in pages
    ) + f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{DOMAIN}/"/>'

    urls = ""
    for p in pages:
        urls += f"""
  <url>
    <loc>{DOMAIN}{p["url"]}</loc>
    <lastmod>{today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>{p["priority"]}</priority>
{alternates_block}
  </url>"""

    sitemap = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
{urls}
</urlset>
"""
    out = BASE_DIR / "sitemap.xml"
    out.write_text(sitemap, encoding="utf-8")
    print(f"\n{C.GREEN}✔ sitemap.xml generat:{C.RESET} {out}")


# ── Informe HTML ──────────────────────────────────────────────────────────────
def generate_report(results: dict):
    rows = ""
    for filename, issues in results.items():
        for sev, icon, cls in [("errors","✖","err"), ("warnings","⚠","warn"), ("ok","✔","ok_")]:
            for msg in issues[sev]:
                rows += f'<tr class="{cls}"><td>{filename}</td><td>{icon}</td><td>{html.escape(msg)}</td></tr>\n'

    report = f"""<!DOCTYPE html>
<html lang="ca">
<head>
  <meta charset="UTF-8"/>
  <title>SEO Audit — Alma Bar Restaurant</title>
  <style>
    body{{font-family:sans-serif;background:#0a0a0a;color:#ede6d8;padding:32px}}
    h1{{color:#c9a14a;margin-bottom:24px}}
    table{{border-collapse:collapse;width:100%}}
    th{{background:#1a1a1a;color:#c9a14a;padding:10px 14px;text-align:left}}
    td{{padding:8px 14px;border-bottom:1px solid #222}}
    .err td{{color:#ff6b6b}} .warn td{{color:#ffd166}} .ok_ td{{color:#6bffb8}}
    .summary{{display:flex;gap:24px;margin-bottom:32px}}
    .card{{background:#161616;border:1px solid #333;border-radius:4px;padding:16px 24px;text-align:center}}
    .card span{{font-size:2rem;font-weight:bold}}
    .card small{{display:block;font-size:.75rem;color:#888;margin-top:4px}}
    .err-card span{{color:#ff6b6b}} .warn-card span{{color:#ffd166}} .ok-card span{{color:#6bffb8}}
  </style>
</head>
<body>
  <h1>🔍 SEO Audit — Alma Bar Restaurant</h1>
  <p>Generat: {datetime.now().strftime("%d/%m/%Y %H:%M")}</p>
  <div class="summary">
    <div class="card err-card"><span>{sum(len(v["errors"]) for v in results.values())}</span><small>Errors</small></div>
    <div class="card warn-card"><span>{sum(len(v["warnings"]) for v in results.values())}</span><small>Avisos</small></div>
    <div class="card ok-card"><span>{sum(len(v["ok"]) for v in results.values())}</span><small>Correctes</small></div>
  </div>
  <table>
    <tr><th>Fitxer</th><th>Nivell</th><th>Missatge</th></tr>
    {rows}
  </table>
</body>
</html>"""

    out = BASE_DIR / "seo_report.html"
    out.write_text(report, encoding="utf-8")
    print(f"\n{C.GREEN}✔ Informe generat:{C.RESET} {out}")


# ── Correcions automàtiques ─────────────────────────────��─────────────────────
def fix_stylesheet_version(content: str, new_version: int = 26) -> str:
    """Actualitza el número de versió del CSS."""
    return re.sub(r'styles\.css\?v=\d+', f'styles.css?v={new_version}', content)


def fix_button_to_link(content: str, lang: str) -> tuple[str, int]:
    """
    Converteix <button onclick="scrollToSection('X')"> en <a href="#X" title="...">
    Retorna (contingut_modificat, n_substitucions)
    """
    labels = {
        "ca": {"reservas": "Reservar taula a Alma Bar Restaurant",
               "menu":     "Veure el menú d'Alma Bar Restaurant",
               "galeria":  "Veure l'espai d'Alma Bar Restaurant"},
        "es": {"reservas": "Reservar mesa en Alma Bar Restaurant",
               "menu":     "Ver el menú de Alma Bar Restaurant"},
        "fr": {"reservas": "Réserver une table à Alma Bar Restaurant",
               "menu":     "Voir le menu d'Alma Bar Restaurant"},
        "en": {"reservas": "Book a table at Alma Bar Restaurant",
               "menu":     "View Alma Bar Restaurant menu"},
        "pt": {"reservas": "Reservar mesa no Alma Bar Restaurant",
               "menu":     "Ver o menu do Alma Bar Restaurant"},
    }
    lang_labels = labels.get(lang, labels["es"])

    def replace_button(m):
        full_tag   = m.group(0)
        classes    = m.group(1)
        section    = m.group(2)
        inner_text = m.group(3)
        title = lang_labels.get(section, f"Anar a #{section}")
        return f'<a href="#{section}" class="{classes}" title="{html.escape(title)}">{inner_text}</a>'

    pattern = (r'<button\s+class="([^"]+)"\s+onclick="scrollToSection\(\'(\w+)\'\)">'
               r'(.*?)</button>')
    new_content, count = re.subn(pattern, replace_button, content, flags=re.DOTALL)
    return new_content, count


def apply_fixes(filepath: Path, lang: str):
    content  = filepath.read_text(encoding="utf-8")
    original = content

    content, n_btns = fix_button_to_link(content, lang)
    content = fix_stylesheet_version(content)

    if content != original:
        filepath.write_text(content, encoding="utf-8")
        print(f"  {C.GREEN}✔{C.RESET} {filepath.name}: {n_btns} botons convertits, versió CSS actualitzada")
    else:
        print(f"  {C.BLUE}ℹ{C.RESET} {filepath.name}: sense canvis necessaris")


# ── Comprovació de fitxers addicionals ───────────────────────────────────────
def check_extras():
    head("Fitxers addicionals")
    for fname in ["robots.txt", "sitemap.xml", "_headers"]:
        p = BASE_DIR / fname
        if p.exists():
            ok(f"{fname} present ({p.stat().st_size} bytes)")
        else:
            err(f"{fname} no trobat — considera crear-lo")


# ── Resum de rendiment (recomanacions) ─────────────────��─────────────────────
def perf_recommendations():
    head("Recomanacions de rendiment")
    img_dir = BASE_DIR / "img"
    if img_dir.exists():
        total_size = sum(f.stat().st_size for f in img_dir.glob("*") if f.is_file())
        size_mb    = total_size / (1024 * 1024)
        n_imgs     = len(list(img_dir.glob("*")))
        info(f"Imatges: {n_imgs} fitxers, {size_mb:.1f} MB total")
        webp_count = len(list(img_dir.glob("*.webp")))
        if webp_count == n_imgs:
            ok("Totes les imatges en format .webp ✓")
        else:
            warn(f"Converteix imatges no-webp: {n_imgs - webp_count} fitxers restants")
    else:
        warn("Directori img/ no trobat")

    css_file = BASE_DIR / "styles.css"
    if css_file.exists():
        css_size = css_file.stat().st_size / 1024
        info(f"styles.css: {css_size:.1f} KB")
        if css_size > 50:
            warn("Considera minificar styles.css (>50 KB)")
        else:
            ok(f"styles.css OK ({css_size:.1f} KB)")

    js_file = BASE_DIR / "script.js"
    if js_file.exists():
        js_size = js_file.stat().st_size / 1024
        info(f"script.js: {js_size:.1f} KB")
        if js_size > 30:
            warn("Considera minificar script.js (>30 KB)")
        else:
            ok(f"script.js OK ({js_size:.1f} KB)")


# ── Main ─────────────────────────────────���─────────────────────────���──────────
def main():
    args = set(sys.argv[1:])
    print(f"\n{C.BOLD}{C.CYAN}{'═'*60}")
    print(f"  SEO Tools — Alma Bar Restaurant")
    print(f"  {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    print(f"{'═'*60}{C.RESET}")

    results = {}
    for filename, config in HTML_FILES.items():
        filepath = BASE_DIR / filename
        if not filepath.exists():
            warn(f"{filename} no trobat, omès")
            continue

        if "--fix" in args:
            head(f"Aplicant correccions: {filename}")
            apply_fixes(filepath, config["lang"])

        issues = audit_file(filepath, config)
        results[filename] = issues
        print_audit(filename, issues)

    check_extras()
    perf_recommendations()

    if "--sitemap" in args:
        head("Generant sitemap.xml")
        generate_sitemap()

    if "--report" in args:
        head("Generant informe HTML")
        generate_report(results)

    # Resum final
    total_errors   = sum(len(v["errors"])   for v in results.values())
    total_warnings = sum(len(v["warnings"]) for v in results.values())
    total_ok       = sum(len(v["ok"])       for v in results.values())
    head("Resum global")
    if total_errors:    err(f"{total_errors} error(s) crític(s) a corregir")
    if total_warnings:  warn(f"{total_warnings} avís(os) a revisar")
    ok(f"{total_ok} comprovacions correctes")
    score = int((total_ok / max(total_ok + total_errors + total_warnings, 1)) * 100)
    color = C.GREEN if score >= 80 else (C.YELLOW if score >= 60 else C.RED)
    print(f"\n  {C.BOLD}Puntuació SEO estimada: {color}{score}/100{C.RESET}\n")


if __name__ == "__main__":
    main()

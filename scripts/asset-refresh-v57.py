from pathlib import Path
from base64 import b64encode
import mimetypes, os, re, subprocess, sys
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / 'visual-fixtures' / 'app.html'
OUT = ROOT / 'public' / 'landing' / 'product'
TMP = ROOT / '.asset-refresh-v57'
TMP.mkdir(exist_ok=True)

STRICT_FONT = os.getenv('ASSET_CAPTURE_STRICT_FONT') == '1'
EXPLICIT_MANROPE = os.getenv('ASSET_CAPTURE_MANROPE_FILE', '').strip()

CSS_ORDER = [
 'styles.css','responsive.css','design-system.css','product-system-v33.css','product-controls-v40.css',
 'setup.css','foundation-v24.css','shell-v24.css','overlays-v24.css','tour-v24.css','forms-v24.css',
 'services-v24.css','whatsapp-v24.css','whatsapp-v39.css','agenda-v24.css','dashboard-v24.css',
 'finance-v24.css','finance-v36.css','billing-v24.css','luma-v35.css','auth-v24.css','booking-v30.css',
 'appointment-lifecycle-v371.css','mobile-app-v510.css','mobile-experience-v511.css'
]

SCREENS = {
 'dashboard': ('dashboard.webp', 1440, 900),
 'agenda': ('agenda.webp', 1440, 900),
 'luma': ('luma.webp', 1440, 900),
 'mobile-dashboard': ('mobile-dashboard.webp', 390, 844),
 'booking': ('booking.webp', 390, 844),
 'finance': ('finance.webp', 1440, 900),
 'whatsapp': ('whatsapp.webp', 1440, 900),
}

def data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    return f'data:{mime};base64,' + b64encode(path.read_bytes()).decode('ascii')

def manrope_font_file() -> Path | None:
    if EXPLICIT_MANROPE:
        p = Path(EXPLICIT_MANROPE).expanduser().resolve()
        return p if p.is_file() else None
    try:
        out = subprocess.check_output(['fc-match', '-f', '%{family}|%{file}', 'Manrope'], text=True).strip()
        family, file = (out.split('|', 1) + [''])[:2]
        p = Path(file)
        if family.lower().startswith('manrope') and p.is_file():
            return p
    except Exception:
        pass
    return None

MANROPE_FILE = manrope_font_file()
if STRICT_FONT and MANROPE_FILE is None:
    raise SystemExit('[asset57] Manrope exact font unavailable. Install Manrope or set ASSET_CAPTURE_MANROPE_FILE before canonical capture.')

def capture_font_css() -> str:
    if MANROPE_FILE is None:
        return ''
    return "@font-face{font-family:'Manrope';src:url(%s);font-weight:200 800;font-style:normal;font-display:block;}" % data_uri(MANROPE_FILE)

def inline_html(screen: str) -> str:
    html = FIXTURE.read_text(encoding='utf-8')
    # Remove external stylesheet/font links; capture uses the exact local CSS cascade.
    html = re.sub(r'<link[^>]+>', '', html)
    css = capture_font_css() + '\n' + '\n'.join((ROOT/'src'/name).read_text(encoding='utf-8') for name in CSS_ORDER)
    # Deterministic capture fallback. Production still uses the canonical Manrope chain.
    css += "\n.qa{display:none!important}html,body{margin:0!important}body{overflow:hidden!important}*{animation:none!important;transition:none!important}"
    html = html.replace('</head>', f'<style>{css}</style></head>')
    html = html.replace("const q=new URLSearchParams(location.search), screen=q.get('screen')||'dashboard', collapsed=q.get('collapsed')==='1';",
                        f"const q=new URLSearchParams(), screen='{screen}', collapsed=false;")
    # Inline every local image referenced by the fixture so set_content needs no navigation/network.
    refs = set(re.findall(r'\.\./public/[^\"\'` )<]+', html))
    for ref in sorted(refs, key=len, reverse=True):
        p = (ROOT/'visual-fixtures'/ref).resolve()
        if p.exists() and p.is_file():
            html = html.replace(ref, data_uri(p))
    return html

def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"[asset57] font mode: {'Manrope exact' if MANROPE_FILE else 'fallback chain (Inter in this environment)'}")
    with sync_playwright() as p:
        launch_kwargs = {'headless': True, 'args': ['--no-sandbox']}
        if os.path.exists('/usr/bin/chromium'):
            launch_kwargs['executable_path'] = '/usr/bin/chromium'
        browser = p.chromium.launch(**launch_kwargs)
        for screen, (filename, w, h) in SCREENS.items():
            page = browser.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
            page.set_content(inline_html('dashboard' if screen == 'mobile-dashboard' else screen), wait_until='load')
            page.wait_for_timeout(800)
            png = TMP / f'{screen}.png'
            page.screenshot(path=str(png), full_page=False)
            page.close()
            im = Image.open(png).convert('RGB')
            im.save(OUT/filename, 'WEBP', quality=88, method=6)
            print(f'[asset57] {filename}: {im.width}x{im.height}')
        browser.close()
    return 0

if __name__ == '__main__':
    raise SystemExit(main())

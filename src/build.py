# docs/index.html と server/play.html を src/ のHTML・JSから組み立てる
#   python3 src/build.py
import os, hashlib
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
config_version = hashlib.sha256(open(os.path.join(root, 'docs', 'config.js'), 'rb').read()).hexdigest()[:12]
sh = open(os.path.join(here, 'shell.html'), encoding='utf-8').read()
sh = sh.replace('/*UI*/', open(os.path.join(here, 'ui.css'), encoding='utf-8').read())
logic = open(os.path.join(here, 'logic.js'), encoding='utf-8').read()
main = open(os.path.join(here, 'main.js'), encoding='utf-8').read()
main = main.replace('/*STADIUM_MEDIA*/', open(os.path.join(here, 'stadium-media.js'), encoding='utf-8').read())
main = main.replace('/*BRAWL_VIEW*/', open(os.path.join(here, 'brawl-view.js'), encoding='utf-8').read())
avatar = open(os.path.join(here, 'avatar.js'), encoding='utf-8').read()
brawl = open(os.path.join(here, 'brawl.js'), encoding='utf-8').read()
sh = sh.replace('/*LOGIC*/', logic).replace('/*AVATAR*/', avatar).replace('/*BRAWL*/', brawl).replace('/*MAIN*/', main)
open(os.path.join(root, 'server', 'avatar-schema.js'), 'w', encoding='utf-8').write(avatar)
cut = sh.index('<canvas id="c"')
head, body = sh[:cut], sh[cut:]
body = body.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>',
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n<script src="config.js?v=' + config_version + '"></script>')
out = ('<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n'
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  '<meta name="description" content="球種とコースで勝負する、3Dのオンライン対戦野球。アカウント不要。">\n'
  + head + '\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{font-size:14px}</style>\n</head>\n<body>\n' + body + '\n</body>\n</html>\n')
open(os.path.join(root, 'docs', 'index.html'), 'w', encoding='utf-8').write(out)
# Renderから直接ページを開く入口。音源などは従来のPagesを利用し、重複配備しない。
direct = out.replace('<head>', '<head>\n<base href="https://yusuke11430-cyber.github.io/BaseBall/">', 1)
open(os.path.join(root, 'server', 'play.html'), 'w', encoding='utf-8').write(direct)
print('built docs/index.html', len(out), 'bytes')

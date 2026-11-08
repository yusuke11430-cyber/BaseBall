# docs/index.html を src/ の4ファイルから組み立てる
#   python3 src/build.py
import os
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
sh = open(os.path.join(here, 'shell.html'), encoding='utf-8').read()
logic = open(os.path.join(here, 'logic.js'), encoding='utf-8').read()
main = open(os.path.join(here, 'main.js'), encoding='utf-8').read()
avatar = open(os.path.join(here, 'avatar.js'), encoding='utf-8').read()
sh = sh.replace('/*LOGIC*/', logic).replace('/*AVATAR*/', avatar).replace('/*MAIN*/', main)
open(os.path.join(root, 'server', 'avatar-schema.js'), 'w', encoding='utf-8').write(avatar)
cut = sh.index('<canvas id="c"')
head, body = sh[:cut], sh[cut:]
body = body.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>',
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n<script src="config.js"></script>')
out = ('<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n'
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  '<meta name="description" content="球種とコースで勝負する、3Dのオンライン対戦野球。アカウント不要。">\n'
  + head + '\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{font-size:14px}</style>\n</head>\n<body>\n' + body + '\n</body>\n</html>\n')
open(os.path.join(root, 'docs', 'index.html'), 'w', encoding='utf-8').write(out)
print('built docs/index.html', len(out), 'bytes')

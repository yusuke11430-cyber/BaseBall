"""Prepare the supplied VJ-TAKAGI VRM0 for in-game display. Original ZIP is untouched.
Usage: python src/process-vrm.py path/to/vj_takagi.zip
"""
import io, json, struct, sys, zipfile
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
with zipfile.ZipFile(sys.argv[1]) as archive:
    raw = archive.read('vj_takagi/vj_takagi.vrm')
length = struct.unpack_from('<I', raw, 12)[0]
g = json.loads(raw[20:20+length])
binary = raw[28+length:]
# This display-only integration does not animate expressions. Keep the neutral
# shape and skeleton; discard unused morph buffers rather than decoding them.
for mesh in g['meshes']:
    mesh.pop('weights', None)
    for primitive in mesh['primitives']:
        primitive.pop('targets', None)
for node in g['nodes']:
    node.pop('weights', None)
g['extensions']['VRM']['blendShapeMaster'] = {'blendShapeGroups': []}
used = set()
for mesh in g['meshes']:
    for primitive in mesh['primitives']:
        used.update(primitive['attributes'].values())
        if 'indices' in primitive: used.add(primitive['indices'])
for skin in g.get('skins', []):
    if 'inverseBindMatrices' in skin: used.add(skin['inverseBindMatrices'])
assert not g.get('animations'), 'Review animated source before optimization'
mapping = {old: new for new, old in enumerate(sorted(used))}
g['accessors'] = [g['accessors'][old] for old in sorted(used)]
for mesh in g['meshes']:
    for primitive in mesh['primitives']:
        primitive['attributes'] = {k: mapping[v] for k, v in primitive['attributes'].items()}
        if 'indices' in primitive: primitive['indices'] = mapping[primitive['indices']]
for skin in g.get('skins', []):
    if 'inverseBindMatrices' in skin: skin['inverseBindMatrices'] = mapping[skin['inverseBindMatrices']]
replacements = {}
for i, image in enumerate(g['images']):
    view = g['bufferViews'][image['bufferView']]
    offset = view.get('byteOffset', 0)
    im = Image.open(io.BytesIO(binary[offset:offset+view['byteLength']])).convert('RGB')
    size = 256 if i in (1, 3) else 1024
    im.thumbnail((size, size), Image.Resampling.LANCZOS)
    output = io.BytesIO(); im.save(output, 'JPEG', quality=88, optimize=True)
    replacements[image['bufferView']] = output.getvalue()
    image['mimeType'] = 'image/jpeg'
views = sorted({a['bufferView'] for a in g['accessors']} | {i['bufferView'] for i in g['images']})
view_map = {}; packed = bytearray(); new_views = []
for old in views:
    v = dict(g['bufferViews'][old]); offset = v.get('byteOffset', 0)
    data = replacements.get(old, binary[offset:offset+v['byteLength']])
    packed.extend(b'\0' * (-len(packed) % 4))
    v.update(buffer=0, byteOffset=len(packed), byteLength=len(data))
    view_map[old] = len(new_views); new_views.append(v); packed.extend(data)
for a in g['accessors']: a['bufferView'] = view_map[a['bufferView']]
for i in g['images']: i['bufferView'] = view_map[i['bufferView']]
g['bufferViews'] = new_views
g['buffers'] = [{'byteLength': len(packed)}]
g['asset']['generator'] += ' / Super Hage BaseBall texture and buffer optimization'
js = json.dumps(g, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
js += b' ' * (-len(js) % 4); packed.extend(b'\0' * (-len(packed) % 4))
out = struct.pack('<III', 0x46546C67, 2, 28+len(js)+len(packed)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(packed), 0x004E4942) + packed
target = root / 'docs/models/vj-takagi.vrm'; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(out)
print(f'VRM: {len(raw):,} -> {len(out):,} bytes; neutral shape, original skeleton and metadata retained')

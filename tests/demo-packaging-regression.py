"""Check Moodle plugin discovery contracts in the actual upload bundle."""
from pathlib import Path
import re
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'demo' / 'moodle'
subprocess.run(['bash', '-n', str(SOURCE / 'setup.sh')], check=True)
subprocess.run([sys.executable, str(SOURCE / 'build_bundle.py')], check=True, capture_output=True)
with tarfile.open(ROOT / 'build' / 'demo' / 'duedle-moodle-demo.tar.gz') as archive:
    members = archive.getmembers()
    for member in members:
        assert member.name.startswith('duedle-moodle-demo/')
        assert '..' not in Path(member.name).parts and not member.issym() and not member.islnk()
    files = {member.name.removeprefix('duedle-moodle-demo/'): archive.extractfile(member).read()
             for member in members if member.isfile()}


def validate_plugins(files):
    roots = set()
    for path in files:
        parts = path.split('/')
        if len(parts) >= 4 and parts[0] == 'plugins' and parts[1] in ('blocks', 'local'):
            roots.add((parts[1], parts[2]))
    # A view.php under /blocks also creates a discovered plugin, even if there
    # is no corresponding plugin source directory. This was the original defect.
    for block in re.findall(r'\$DEMO_WEB/blocks/([a-z_]+)/', files['setup.sh'].decode()):
        roots.add(('blocks', block))
    for kind, name in roots:
        base = f'plugins/{kind}/{name}/'
        component = ('block_' if kind == 'blocks' else 'local_') + name
        assert base + 'version.php' in files, f'{component}: missing version.php'
        version = files[base + 'version.php'].decode()
        assert re.search(r'\$plugin->component\s*=\s*[\'"]' + component + r'[\'"]', version), component
        assert re.search(r'\$plugin->version\s*=\s*\d+', version), component
        assert base + f'lang/en/{component}.php' in files, component
        if kind == 'blocks':
            classname = f'block_{name}'
            assert base + classname + '.php' in files, component
            assert re.search(r'class\s+' + classname + r'\s+extends\s+block_base',
                             files[base + classname + '.php'].decode()), component
    return len(roots)


count = validate_plugins(files)
broken = dict(files)
del broken['plugins/blocks/syllabus/version.php']
try:
    validate_plugins(broken)
except AssertionError as error:
    assert 'block_syllabus: missing version.php' in str(error)
else:
    raise AssertionError('The original missing-version defect must be detected')
assert 'finish_install.php' in files
# Required fields without defaults, checked against the pinned Moodle XMLDB
# schema (lib/db/install.xml and the two assignment submission plugins).
required_fields = {
    'block_instances': {'blockname', 'parentcontextid', 'showinsubcontexts', 'pagetypepattern',
                        'defaultregion', 'defaultweight', 'timecreated', 'timemodified'},
    'question_categories': {'name', 'info', 'stamp'},
    'assignsubmission_file': set(),
    'assignsubmission_onlinetext': set(),
}


def validate_insert_fields(seed):
    inserts = re.findall(r"\$DB->insert_record\('([^']+)', \(object\)\[(.*?)\]\);", seed, re.S)
    assert {table for table, _ in inserts} == set(required_fields)
    for table, body in inserts:
        keys = set(re.findall(r"'([a-z_]+)'\s*=>", body))
        missing = required_fields[table] - keys
        assert not missing, f'{table}: missing required columns {sorted(missing)}'


seed = files['seed.php'].decode()
validate_insert_fields(seed)
for field in ('timecreated', 'timemodified'):
    broken_seed = re.sub(r"'" + field + r"'\s*=>\s*\$now,?", '', seed)
    try:
        validate_insert_fields(broken_seed)
    except AssertionError as error:
        assert field in str(error)
    else:
        raise AssertionError(f'Missing {field} must be detected before deployment')
for name in ('setup.sh', 'seed.php', 'finish_install.php'):
    assert files[name] == (SOURCE / name).read_bytes(), f'Stale upload file: {name}'
print(f'PASS demo upload bundle: {count} complete Moodle plugins; missing-version and required DB-column defects rejected; current installer/recovery files included')

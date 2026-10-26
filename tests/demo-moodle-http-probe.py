"""Read-only HTTP verification of the explicitly configured synthetic Moodle.

Set DUEDLE_DEMO_PASSWORD in the process environment; credentials are never saved.
Only temporary HTML/API responses are recorded for parser/collector replay.
"""
import http.cookiejar
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import tempfile
import time
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import build_opener, HTTPCookieProcessor, Request

BASE = 'https://duedle-35-184-191-167.sslip.io/moodle40a/'
password = os.environ['DUEDLE_DEMO_PASSWORD']
opener = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
directory = Path(tempfile.mkdtemp(prefix='duedle-demo-responses-'))


class Elements(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.inputs, self.links = {}, []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'input' and attrs.get('name'):
            self.inputs[attrs['name']] = attrs.get('value', '')
        if tag == 'a' and attrs.get('href'):
            self.links.append(urljoin(BASE, attrs['href']))


def fetch(url, data=None, content_type=None):
    assert urlparse(url).netloc == urlparse(BASE).netloc
    headers = {'User-Agent': 'DuedleDemoVerification/1.0'}
    if content_type:
        headers['Content-Type'] = content_type
    with opener.open(Request(url, data=data, headers=headers), timeout=40) as response:
        assert urlparse(response.url).netloc == urlparse(BASE).netloc
        return response.read(), response.url, dict(response.headers)


login, _, _ = fetch(BASE + 'login/index.php')
token = Elements(login.decode()).inputs['logintoken']
_, final, _ = fetch(BASE + 'login/index.php', urlencode({
    'username': 'reviewer', 'password': password, 'logintoken': token,
}).encode(), 'application/x-www-form-urlencoded')
assert '/login/' not in final, 'Student login failed'
dashboard, _, headers = fetch(BASE + 'my/')
sesskey = re.search(r'"sesskey"\s*:\s*"([^"]+)"', dashboard.decode())[1]
recording = {'base': BASE, 'serverDate': headers.get('Date'), 'api': {}, 'pages': {}}


def api(method, args):
    body, _, _ = fetch(BASE + 'lib/ajax/service.php?' + urlencode({'sesskey': sesskey, 'info': method}),
                       json.dumps([{'index': 0, 'methodname': method, 'args': args}]).encode(), 'application/json')
    payload = json.loads(body)
    assert len(payload) == 1 and not payload[0].get('error'), method + ' failed'
    key = str(args.get('courseid', 'enrolled'))
    recording['api'].setdefault(method, {})[key] = payload
    return payload[0]['data']


recording['pages'][BASE + 'my/'] = 'dashboard.html'
(directory / 'dashboard.html').write_bytes(dashboard)
enrolled = api('core_course_get_enrolled_courses_by_timeline_classification', {'classification': 'all', 'limit': 0, 'offset': 0})
courses = enrolled['courses']
assert len(courses) == 3, 'Expected three synthetic courses'
activities = {}
for course in courses:
    courseurl = BASE + 'course/view.php?' + urlencode({'id': course['id']})
    html, _, _ = fetch(courseurl)
    name = f'course-{course["id"]}.html'
    (directory / name).write_bytes(html)
    recording['pages'][courseurl] = name
    state = api('core_courseformat_get_state', {'courseid': course['id']})
    api('core_course_get_updates_since', {'courseid': course['id'], 'since': int(time.time()) - 86400})
    if isinstance(state, str):
        state = json.loads(state)
    for cm in state['cm']:
        url = cm.get('url', '')
        if re.search(r'/mod/(assign|quiz)/view\.php\?id=\d+$', url):
            activities[url] = cm
assert len(activities) == 10, 'Expected seven assignments and three quizzes'
files_checked = []
for index, url in enumerate(activities):
    html, final, _ = fetch(url)
    assert '/login/' not in final
    name = f'activity-{index}.html'
    (directory / name).write_bytes(html)
    recording['pages'][url] = name
    for link in Elements(html.decode()).links:
        if '/assignsubmission_file/submission_files/' in link:
            data, _, fileheaders = fetch(link)
            assert data
            files_checked.append({'type': fileheaders.get('Content-Type', '').split(';')[0], 'bytes': len(data)})
assert len(files_checked) == 3, 'Expected three submitted preview fixtures'
recording['activities'] = list(activities)
recording['files'] = files_checked
(directory / 'recording.json').write_text(json.dumps(recording))
print(json.dumps({'verified': 'HTTPS, student login, enrolled-course/state/update APIs, activity details and authenticated submitted files',
                  'courses': len(courses), 'activities': len(activities), 'files': files_checked, 'recording': str(directory)}, ensure_ascii=False))

// Synthetic Moodle DOM and local storage only; no live university requests.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = 'https://cms7.ict.nitech.ac.jp/moodle40a/';
(async () => {
    const browser = await chromium.launch({ headless: true,
        executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    try {
        const page = await browser.newPage();
        await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
        await page.goto(root + 'my/');
        for (const file of ['common/utils.js', 'storage/class/StorageUtil.js', 'storage/class/scrape/Scrape.js',
            'storage/class/scrape/ScrapeAssign.js', 'storage/class/scrape/ScrapeQuiz.js',
            'storage/class/CourseCollector.js', 'storage/class/AutoRefreshCollector.js',
            'storage/class/task/TaskBox.js', 'storage/class/task/AssignBox.js', 'storage/class/task/QuizBox.js',
            'storage/display/displaybox.js']) {
            await page.addScriptTag({ path: path.resolve('src', file) });
        }
        const result = await page.evaluate(async root => {
            const check = (value, message) => { if (!value) throw new Error(message); };
            const doc = html => new DOMParser().parseFromString('<!doctype html><html lang="ja"><body class="course-42"><h1>Course</h1>' + html + '</body></html>', 'text/html');
            const task = (type, id, text = 'Task') => `<li class="activity" id="module-${id}" data-id="${id}"><div class="activity-item"><a href="${root}mod/${type}/view.php?id=${id}">${text}</a></div></li>`;
            const section = (number, contents, badge = '', cls = '', name = `Week ${number}`) => `<li class="section course-section ${cls}" id="section-${number}" data-sectionid="${number}"><div class="course-section-header"><h3 class="sectionname">${name}</h3><div class="sectionbadges">${badge}</div></div><a href="${root}course/view.php?id=42&section=${number}">Section</a><ul>${contents}</ul></li>`;
            const missingLinks = section(4, '', '<span class="badge badge-pill badge-secondary order-3">利用できません。</span>', 'hidden', '第4回 10/23');
            const restrictedActivity = '<li class="activity modtype_quiz" data-for="cmitem" id="module-206" data-id="206"><div class="activity-item"><span class="activityname">条件付き小テスト</span><div class="availabilityinfo isrestricted">利用可能: 指定の条件を満たすこと</div></div></li>';
            const hiddenActivity = '<li class="activity modtype_quiz" data-for="cmitem" id="module-207"><div class="activity-item hiddenactivity"><span class="activityname">非表示の小テスト</span></div></li>';
            const main = `<div class="course-content"><ul>
                ${section(1, task('assign', 101, '利用できませんという文言の課題') + task('quiz', 201)
                    + task('quiz', 204).replace('</div></li>', '<div class="availabilityinfo">Not available until next week</div></div></li>')
                    + restrictedActivity + hiddenActivity + task('quiz', 208).replace('<a href=', '<a class="dimmed" href='))}
                ${section(2, task('assign', 102) + task('quiz', 202) + `<a href="${root}mod/assign/view.php?id=101">Reference</a>`, '<span class="badge">利用できません。</span>')}
                ${section(3, task('assign', 103), '', 'hidden')}
                ${missingLinks}
                ${section(5, `<div class="collapse" hidden>${task('quiz', 205)}</div>`)}
                </ul></div><aside><a href="${root}course/view.php?id=42&section=2">Locked section shortcut</a>
                <a href="${root}mod/quiz/view.php?id=999">Unrelated navigation</a></aside>`;
            const parsed = doc(main);
            const available = CourseCollector.getItems(parsed, root + 'course/view.php?id=42');
            check(JSON.stringify(available.map(i => i.id)) === '[101,201,205]', 'Availability must respect section/activity scope while preserving collapsed activities');
            check(CourseCollector.getTaskAvailability(doc(restrictedActivity.replace(/206/g, '105').replace('modtype_quiz', 'modtype_assign'))).some(item => item.type === 'assign' && item.id === 105 && !item.available), 'Linkless restricted assignments use their module ID and type');
            check(CourseCollector.getItems(doc(task('quiz', 301).replace('</div></li>', '<div class="availabilityinfo isrestricted">利用可能: 条件付き</div></div></li>'))).some(item => item.id === 301), 'Restriction information alone cannot hide an accessible activity');
            const sections = CourseCollector.getSectionURLs(parsed, root + 'course/view.php?id=42', 42);
            check(sections.every(url => !/[?&]section=[23]$/.test(url)), 'Sidebar must not bypass an unavailable section');
            const crosslink = doc('<div class="course-content">' + task('assign', 101).replace('</div>', `<a href="${root}mod/quiz/view.php?id=202">Description reference</a></div>`) + '</div>');
            check(CourseCollector.getItems(crosslink).length === 1, 'Activity description crosslinks are not module entries');
            for (const marker of ['<span class="badge">Not available</span>', '<div class="availabilityinfo">利用できません。</div>']) {
                check(!CourseCollector.getItems(doc(section(2, task('quiz', 202), marker))).length, 'Both language variants of restrictions must be respected');
            }
            const makeTask = (type, id, extra = {}) => ({ group: type + '_list', [type === 'assign' ? 'assignId' : 'quizId']: id,
                courseId: 42, show: true, status: 'incomplete', fetchedAt: 1, ...extra });
            const memory = { assign_list: [makeTask('assign', 102), makeTask('assign', 901, { courseId: 9 })],
                quiz_list: [makeTask('quiz', 202, { show: false, status: 'qualify' }), makeTask('quiz', 203, { quizName: '通常の保存済み課題' }),
                    makeTask('quiz', 250333, { quizName: '宿題：Grammar [4]' }), makeTask('quiz', 250334),
                    ...[206, 207, 208, 209].map(id => makeTask('quiz', id))],
                courseAvailability: { 42: { items: {}, complete: true } } };
            globalThis.ext = { storage: { local: {
                get: async keys => Object.fromEntries((typeof keys === 'string' ? [keys] : keys).filter(key => key in memory).map(key => [key, structuredClone(memory[key])])),
                set: async values => Object.assign(memory, structuredClone(values))
            }, sync: { get: async () => ({ selectedType: 'all', selectedStatus: 'ex-complete', selectedShow: 'normal', selectedDue: 'all' }) } } };
            StorageUtil.isBackground = true;
            const recoveredDisplay = document.createElement('div');
            document.body.appendChild(recoveredDisplay);
            check(await displaybox(await StorageUtil.getAllData(), recoveredDisplay) === 9, 'Previously saved empty complete snapshots must not empty the real task list');
            check(recoveredDisplay.textContent.includes('通常の保存済み課題'), 'Normal cached task cards render under the actual default filters');
            const requests = [];
            let failSection = false;
            const indexHTML = '<h1>Course</h1><table class="generaltable"><thead><tr><th>トピック</th><th>小テスト</th><th>終了予定</th></tr></thead><tbody>'
                + '<tr><td>第4回 10/23</td><td><a href="view.php?id=250333">宿題：Grammar [4]</a></td><td>締切</td></tr>'
                + '<tr><td></td><td><a href="view.php?id=250334">Unit 4</a></td><td>締切</td></tr>'
                + '<tr><td colspan="3"><hr></td></tr><tr><td>Week 1</td><td><a href="view.php?id=201">Normal quiz</a></td><td></td></tr>'
                + [206, 207, 208].map(id => `<tr><td></td><td><a href="view.php?id=${id}">Task</a></td><td></td></tr>`).join('')
                + '<tr><td></td><td><a class="dimmed" href="view.php?id=209">Hidden quiz</a></td><td></td></tr></tbody></table>';
            const ambiguous = doc(section(1, '', '', '', '第4回 10/23') + missingLinks);
            check(!CourseCollector.getIndexAvailability(doc(indexHTML), root + 'mod/quiz/index.php?id=42', 'quiz', CourseCollector.getSectionAvailability(ambiguous))
                .some(item => item.id === 250333), 'Duplicate section names with different availability cannot deny a quiz');
            let unavailableIndexes = 0;
            const failedIndexes = new Map();
            const noIndex = async () => { unavailableIndexes++; throw Object.assign(new Error('Synthetic missing index'), { status: 404 }); };
            for (let attempt = 0; attempt < 2; attempt++) {
                const observations = await CourseCollector.collectAvailability(parsed, root + 'course/view.php?id=42', noIndex, failedIndexes);
                check(!observations.some(item => item.id === 250333), 'A failed lookup cannot classify an unobserved task as unavailable');
            }
            check(unavailableIndexes === 2, 'A failed index is not requested again for every course section');
            const fetch = async url => {
                requests.push(url);
                const parsedURL = new URL(url);
                const number = Number(parsedURL.searchParams.get('section'));
                if (parsedURL.pathname.endsWith('/quiz/index.php')) return { ok: true, url, text: async () => indexHTML };
                if (parsedURL.pathname.endsWith('/assign/index.php')) return { ok: true, url, text: async () => '<h1>Course</h1>' };
                if (parsedURL.pathname.endsWith('/course/view.php')) {
                    check(![2, 3].includes(number), 'Never request an unavailable section');
                    if (number && failSection) throw new Error('Synthetic page failure');
                    return { ok: true, url, text: async () => number ? '<h1>Course</h1><div class="course-content">' + missingLinks + '</div>' : '<h1>Course</h1>' + main };
                }
                const id = Number(parsedURL.searchParams.get('id'));
                check([101, 201, 203, 205].includes(id), 'Never request a restricted task detail');
                return { ok: true, url, text: async () => '<html lang="ja"><body class="course-42"><h1>Course</h1><h2>Task</h2></body></html>' };
            };
            const collector = new CourseCollector({ fetch });
            const discoveredAt = Date.now();
            const firstAuto = await new AutoRefreshCollector({ fetch, now: () => discoveredAt, pause: async () => {} }).run({
                state: { courses: { 42: { seenAt: discoveredAt, discoveredAt: 0 } }, pending: {
                    'quiz:250333': { type: 'quiz', id: 250333, courseId: 42, addedAt: discoveredAt, neededAt: discoveredAt, changed: true }
                } }
            });
            check(firstAuto.failed === 0 && !firstAuto.state.pending['quiz:250333'], 'Automatic course discovery resolves and removes a calendar-only pending unavailable quiz');
            check(!requests.some(url => /\/quiz\/view.php\?id=250333$/.test(url)), 'An unresolved calendar quiz is not fetched before its course/index restriction is checked');
            check(requests.some(url => /\/quiz\/view.php\?id=203$/.test(url)), 'A missing course link cannot prevent normal cached detail updates');
            failSection = true;
            await collector.run([42]);
            check((await StorageUtil.getAllData()).some(task => task.quizId === 203), 'A failed/partial course scan must preserve unobserved cached tasks');
            failSection = false;
            requests.length = 0;
            const collected = await collector.run([42]);
            check(collected.courses === 1 && collected.failed === 0, 'Complete course collection must succeed');
            check(!requests.some(url => /\/quiz\/view.php\?id=203$/.test(url)), 'Manual collection must not probe saved tasks absent from the course page');
            check(requests.filter(url => url.includes('/quiz/index.php')).length === 1, 'Index lookups are reused across section pages');
            const visible = await StorageUtil.getAllData();
            check(!visible.some(task => [102, 202, 206, 207, 208, 209, 250333, 250334].includes(task.assignId || task.quizId)), 'Section and individual restrictions hide only the affected cached tasks');
            check(memory.quiz_list.some(task => task.quizId === 250333 && task.show === true), 'Section restrictions do not erase cached tasks or user preferences');
            check(visible.some(task => task.quizId === 203), 'An unobserved task must remain visible rather than being assumed unavailable');
            check(visible.some(task => task.assignId === 901), 'Other courses must remain intact');
            const anotherPage = doc(section(1, ''));
            await StorageUtil.setCourseAvailability(42, await CourseCollector.collectAvailability(anotherPage, root + 'course/view.php?id=42', async url => doc(url.includes('/quiz/') ? indexHTML : '')));
            check(!(await StorageUtil.getAllData()).some(task => [206, 207, 208, 209].includes(task.quizId)), 'A public parent section on another page cannot clear individual task restrictions');
            const actualList = document.createElement('div');
            await displaybox(visible, actualList);
            check(!actualList.querySelector('a[href*="id=250333"]') && actualList.querySelector('a[href*="id=203"]'), 'The real list hides Grammar [4] while preserving normal cards');
            await StorageUtil.saveData('quiz_list', 'quizId', makeTask('quiz', 202, { status: 'incomplete', fetchedAt: 2 }));
            await StorageUtil.saveQuizReviewOverview(makeTask('quiz', 202, { fetchedAt: 2 }), 1);
            check(memory.quiz_list.find(task => task.quizId === 202).status === 'qualify', 'Direct and review saves must not overwrite unavailable tasks');
            await StorageUtil.saveData('quiz_list', 'quizId', makeTask('quiz', 250333, { status: 'complete', fetchedAt: 2 }));
            check(memory.quiz_list.find(task => task.quizId === 250333).status === 'incomplete', 'Opening Grammar [4] directly cannot bypass its recorded section restriction');
            const now = Date.now();
            const auto = new AutoRefreshCollector({ fetch, now: () => now, pause: async () => {} });
            const state = { courses: { 42: { discoveredAt: now, seenAt: now } },
                pending: { 'quiz:202': { type: 'quiz', id: 202, courseId: 42, changed: true, neededAt: now } } };
            requests.length = 0;
            const refreshed = await auto.run({ state });
            check(refreshed.failed === 0, 'Automatic refresh succeeds without requesting unavailable task details');
            check(requests.every(url => !/id=(102|202|206|207|208|209|250333|250334)$/.test(url)), 'Automatic refresh must never fetch known unavailable task details');
            await StorageUtil.setCourseAvailability(42, [{ type: 'quiz', id: 202, available: true }]);
            const restored = (await StorageUtil.getAllData()).find(task => task.quizId === 202);
            check(restored && restored.show === false && restored.status === 'qualify', 'Released tasks must retain user visibility and completion settings');
            const released = doc('<div class="course-content">' + section(4, task('quiz', 250333), '', '', '第4回 10/23') + '</div>');
            const releasedItems = await CourseCollector.collectAvailability(released, root + 'course/view.php?id=42', async url => doc(url.includes('/quiz/') ? indexHTML : '<h1>Course</h1>'));
            await StorageUtil.setCourseAvailability(42, releasedItems);
            check((await StorageUtil.getAllData()).some(task => task.quizId === 250333 && task.show === true), 'An accessible quiz link restores the quiz after its section becomes available');
            globalThis.fetch = fetch;
            globalThis.duedleCollectAccountContext = async () => ({ accountId: 'fixture', pageId: 'fixture-course' });
            ext.runtime = { onMessage: { addListener(handler) { globalThis.courseCollectionHandler = handler; } } };
            history.replaceState(null, '', root + 'course/view.php?id=42');
            document.body.innerHTML = '<h1>Course</h1>' + main;
            return { available: available.map(i => i.id), collected: collected.saved, restored: restored.quizId };
        }, root);
        assert.deepEqual(result, { available: [101, 201, 205], collected: 3, restored: 202 });
        await page.addScriptTag({ path: path.resolve('src/storage/cs_scrapeTaskList.js') });
        await page.waitForFunction(async () => (await StorageUtil.getCourseAvailability())[42]?.items['quiz:250333'] === false);
        const response = await page.evaluate(() => new Promise(resolve => courseCollectionHandler({ type: 'COLLECT_COURSE_ITEMS' }, {}, resolve)));
        assert(response.ok && response.availability.some(item => item.type === 'quiz' && item.id === 250333 && item.available === false));
        assert(response.items.some(item => item.type === 'quiz' && item.id === 201));
        await page.evaluate(async root => {
            const check = (value, message) => { if (!value) throw new Error(message); };
            const doc = new DOMParser().parseFromString('<input name="sesskey" value="synthetic">', 'text/html');
            let mode = 'success';
            const collector = new CourseCollector({ fetch: async (url, options) => {
                const args = JSON.parse(options.body)[0].args;
                check(args.classification === 'all' && args.limit === 0 && args.offset === 0,
                    'Only the full visible course list is requested; hidden courses are not searched');
                if (mode === 'network') throw new Error('Synthetic network failure');
                return { ok: true, json: async () => mode === 'invalid' ? [{ data: { courses: null } }]
                    : [{ data: { courses: mode === 'empty' ? [] : [{ id: 42 }, { id: 9 }, { id: 42 }] } }] };
            } });
            const memory = { assign_list: [{ group: 'assign_list', assignId: 1, courseId: 42, show: true },
                { group: 'assign_list', assignId: 2, courseId: 7, show: false }], quiz_list: [], enrolledCourseIds: null };
            ext.storage.local.get = async keys => Object.fromEntries((typeof keys === 'string' ? [keys] : keys)
                .filter(key => key in memory).map(key => [key, structuredClone(memory[key])]));
            ext.storage.local.set = async values => Object.assign(memory, structuredClone(values));
            const refreshMembership = async () => {
                const ids = await collector.enrolledCourseIds(doc);
                await ext.storage.local.set({ enrolledCourseIds: ids });
            };
            await refreshMembership();
            check((await StorageUtil.getAllData()).length === 1, 'A departed course disappears from the displayed list');
            for (mode of ['network', 'invalid']) {
                let rejected = false;
                try { await refreshMembership(); } catch { rejected = true; }
                check(rejected && memory.enrolledCourseIds.join(',') === '42,9',
                    'Unconfirmed responses must not replace membership');
            }
            mode = 'empty';
            await refreshMembership();
            check((await StorageUtil.getAllData()).length === 0 && memory.assign_list.length === 2,
                'Verified zero enrolments clears the list without erasing saved preferences');
        }, root);
        console.log('PASS real-DOM availability, manual/automatic collection, partial scans, direct saves, and release restoration');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

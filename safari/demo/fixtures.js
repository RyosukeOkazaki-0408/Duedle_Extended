// Sample scenarios; each call starts with independent data and relative dates.
globalThis.duedleDemoFixtures = () => {
    const demoNow = Date.now(), demoDay = 86400000;
    const demoTask = (id, name, days, status, quiz = false) => ({
        group: quiz ? 'quiz_list' : 'assign_list', [quiz ? 'quizId' : 'assignId']: id,
        [quiz ? 'quizName' : 'assignName']: name, courseName: quiz ? '数学 / Mathematics' : 'プログラミング / Programming',
        courseId: quiz ? 2 : 1, start: new Date(demoNow - 7 * demoDay).toISOString(),
        due: new Date(demoNow + days * demoDay).toISOString(), fetchedAt: demoNow, status, show: true,
        file: status === 'complete' ? 'sample-report.pdf' : '?', filenum: status === 'complete' ? 1 : 0,
        point: status === 'qualify' ? 8 : 3, maxp: 10, required: 6, requiredState: 'known', count: 1, maxcount: 3,
    });
    return {
        local: { themeDefault: 2, thememode: 2, iosAppearance: true,
            assign_list: [demoTask(1, 'レポート / Report', 7, 'incomplete'), demoTask(2, '締切間近 / Due soon', 1, 'warning'),
                demoTask(3, '期限切れ / Overdue', -2, 'expired'), demoTask(4, '提出済み / Submitted', 5, 'complete')],
            quiz_list: [demoTask(5, '確認テスト / Practice quiz', 5, 'incomplete', true), demoTask(6, '合格済み / Passed quiz', 6, 'qualify', true)] },
        sync: {},
    };
};

//get param
const param = new URLSearchParams(window.location.search);
ext.storage.local.get(["courseIds"]).then(async result => {
    if (globalThis.duedleAccountActive === false) return;
    const courseIds = result.courseIds || [];
    const uniqueIds = new Set(courseIds);
    uniqueIds.add(Number(param.get('id')));
    await ext.storage.local.set({ courseIds: Array.from(uniqueIds) });
}).catch(console.error);

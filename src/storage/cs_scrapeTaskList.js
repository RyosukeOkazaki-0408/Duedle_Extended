const courseAvailabilityId = Number(new URL(location.href).searchParams.get("id"));
let courseAvailabilityRead;
const readCourseAvailability = () => courseAvailabilityRead ||= CourseCollector.collectAvailability(document, location.href);
if (new URL(location.href).pathname === "/moodle40a/course/view.php"
    && Number.isSafeInteger(courseAvailabilityId) && courseAvailabilityId > 0
    && document.querySelector("h1") && !document.querySelector(".errorcode, .errormessage")) {
  (async () => {
    await StorageUtil.setCourseAvailability(courseAvailabilityId, CourseCollector.getTaskAvailability(document, location.href));
    await StorageUtil.setCourseAvailability(courseAvailabilityId, await readCourseAvailability());
  })().catch(console.error);
}
ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "COLLECT_COURSE_ITEMS") return false;
  (async () => {
    const account = await globalThis.duedleCollectAccountContext();
    if (!document.querySelector("h1") || document.querySelector(".errorcode, .errormessage")) {
      return { ok: false, error: "コースを開けませんでした" };
    }
    const availability = await readCourseAvailability();
    const blocked = new Set(availability.filter(item => !item.available).map(item => `${item.type}:${item.id}`));
    return { ok: true, items: CourseCollector.getItems(document, location.href).filter(item => !blocked.has(`${item.type}:${item.id}`)),
      availability,
      sections: CourseCollector.getSectionURLs(document, location.href, Number(new URL(location.href).searchParams.get("id"))), ...account };
  })().then(sendResponse, error => sendResponse({ ok: false, error: error.message, code: error.code }));
  return true;
});

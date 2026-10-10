ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "COLLECT_COURSE_ITEMS") return false;
  if (!document.querySelector("h1") || document.querySelector(".errorcode, .errormessage")) {
    sendResponse({ ok: false, error: "コースを開けませんでした" });
  } else {
    sendResponse({ ok: true, items: CourseCollector.getItems(document, location.href) });
  }
  return false;
});

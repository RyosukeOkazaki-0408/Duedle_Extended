ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "COLLECT_COURSE_ITEMS") return false;
  (async () => {
    const account = await globalThis.duedleCollectAccountContext();
    if (!document.querySelector("h1") || document.querySelector(".errorcode, .errormessage")) {
      return { ok: false, error: "コースを開けませんでした" };
    }
    return { ok: true, items: CourseCollector.getItems(document, location.href),
      sections: CourseCollector.getSectionURLs(document, location.href, Number(new URL(location.href).searchParams.get("id"))), ...account };
  })().then(sendResponse, error => sendResponse({ ok: false, error: error.message, code: error.code }));
  return true;
});

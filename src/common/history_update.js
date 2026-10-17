(async () => {
  const title = document.title;
  const url = location.href;
  if (!title || !url) {
    alert("ページのタイトルまたはURLの取得に失敗しました。");
    return;
  }
  // Append against the latest background snapshot so simultaneous page opens
  // cannot overwrite one another. Collector tabs are filtered there as well.
  const reply = await ext.runtime.sendMessage({ type: "ACCOUNT_APPEND_HISTORY", entry: { title, url } });
  if (!reply?.ok) throw new Error(reply?.error || "履歴を保存できませんでした。");
})().catch(console.error);

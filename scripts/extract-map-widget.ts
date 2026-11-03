const html = await Bun.file(
  "C:/Users/admin/Downloads/JOSTI_UIUX_Offline_Prototype/JOSTI_UIUX/index.html",
).text();
const js = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
const start = js.indexOf("function mapWidget");
const end = js.indexOf("\nfunction mapPage");
const fn = js.slice(start, end);
await Bun.write("web/src/prototype/map-widget.js", fn);
await Bun.write("mobile/src/prototype/map-widget.js", fn);

// Also extract trucks + colors + truckStatus helpers needed
const trucksStart = js.indexOf("function trucks()");
const trucksEnd = js.indexOf("\nfunction mapWidget");
await Bun.write(
  "web/src/prototype/map-helpers.js",
  js.slice(trucksStart, trucksEnd) +
    "\n" +
    js.slice(js.indexOf("const truckStatus="), js.indexOf("const stages=")),
);
console.log("mapWidget bytes", fn.length);
console.log(fn.slice(0, 400));
console.log("...");
console.log(fn.slice(-400));

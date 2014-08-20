(function () {
  var c = document.cookie.split(";").map(function (s) {
    return s.trim();
  });

  var theme = "/css/themes/slate.css";
  for (var i = 0; i < c.length; i++) {
    if (c[i].indexOf("cytube-theme=") === 0) {
      theme = c[i].split("=")[1];
      break;
    }
  }

  if (theme == null || !theme.match(/^\/css\/themes\/.+?.css$/)) {
    return;
  }

  if (theme !== "/css/themes/slate.css") {
    console.log("THEME COOKIE:", theme);
    var cur = document.getElementById("usertheme");
    cur.parentNode.removeChild(cur);
    var css = document.createElement("link");
    css.setAttribute("rel", "stylesheet");
    css.setAttribute("type", "text/css");
    css.setAttribute("href", theme);
    css.setAttribute("id", "usertheme");
    document.head.appendChild(css);
  }
})();

(function (document, window, framework, log) {
    // =========================================================================
    // Chiude automaticamente la schermata "Guida agli avvisi" della CMU quando
    // mostra l'avviso DPF ("Accumulo PM in DPF").
    //
    // Testo reale dell'avviso:
    //   "DPF Accumulo PM in DPF
    //    La sostanza particolata (PM) raccolta nel filtro particolato diesel
    //    (DPF) ha superato il limite regolare. Guidare per 10-15 minuti ..."
    //
    // NON e' un popup ma una SCHERMATA (app "Guida agli avvisi"): quindi non la
    // nascondo (lascerebbe lo schermo vuoto), ma provo a USCIRNE simulando il
    // "back" (la freccia a sinistra), tornando alla schermata precedente.
    //
    // Iniettato all'avvio dell'HMI: NON servono touch, terminale, tastiera, dump.
    // Agisce solo sul messaggio a schermo, non sulla spia cruscotto ne' sull'ECU.
    // =========================================================================

    // ------------------------------------------------------------- CONFIG ----
    // La schermata e' "DPF" se il suo testo contiene una di queste (minuscolo).
    var DPF_KEYWORDS = ['accumulo pm in dpf', 'particolato diesel', 'in dpf'];

    // Se il "back" non funziona, in fallback nasconde comunque la schermata.
    var HIDE_FALLBACK = true;

    // Quante volte ritentare la chiusura (l'avviso a volte ricompare).
    var SWEEP_MS = 1200;

    // ------------------------------------------------------------ utility ----
    function lc(s) {
        return ('' + (s || '')).toLowerCase();
    }

    function xssLog(view, msg, className) {
        var b = document.createElement("div");
        b.className = className;
        b.innerHTML = msg;
        view.appendChild(b);
    }

    function inXss(el) {
        while (el) {
            if (el.className && lc(el.className).indexOf('xss-') !== -1) return true;
            el = el.parentNode;
        }
        return false;
    }

    function matchKeyword(el) {
        var t = lc(el.textContent);
        if (!t) return null;
        for (var i = 0; i < DPF_KEYWORDS.length; i++) {
            if (DPF_KEYWORDS[i] && t.indexOf(DPF_KEYWORDS[i]) !== -1) return DPF_KEYWORDS[i];
        }
        return null;
    }

    function describe(el) {
        var c = '';
        try {
            c = '' + (el.className || '');
        } catch (e) {
        }
        return (el.tagName || '?') + (el.id ? ('#' + el.id) : '') +
            (c ? ('.' + c.split(' ').join('.')) : '');
    }

    function fireClick(el) {
        try {
            ['mousedown', 'mouseup', 'click'].forEach(function (type) {
                var ev = document.createEvent('MouseEvents');
                ev.initMouseEvent(type, true, true, window, 1, 0, 0, 0, 0,
                    false, false, false, false, 0, null);
                el.dispatchEvent(ev);
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    // Cerca DENTRO la schermata dell'avviso un controllo "back"/uscita e lo clicca.
    function clickBack(viewEl) {
        var candidates = viewEl.querySelectorAll('*');
        var i, el, sig;
        var re = /back|return|prev|chevron|arrow|left|close|dismiss|home|exit/;
        for (i = 0; i < candidates.length; i++) {
            el = candidates[i];
            sig = lc(el.className) + ' ' + lc(el.id);
            try {
                sig += ' ' + lc(el.getAttribute('data-id') || '') + ' ' + lc(el.getAttribute('role') || '');
            } catch (e) {
            }
            if (re.test(sig)) {
                window.__dpfBackHit = describe(el);
                if (fireClick(el)) return true;
            }
        }
        return false;
    }

    // Tentativi via framework (best-effort, tutti in try/catch).
    function frameworkBack() {
        var tried = [];
        function t(fn, label) {
            try {
                fn();
                tried.push(label);
            } catch (e) {
            }
        }
        t(function () { framework.sendEventToMmui("home", "SelectHome"); }, 'home/SelectHome');
        t(function () { framework.sendEventToMmui("System", "back"); }, 'System/back');
        t(function () { framework.routeMmuiMsg && framework.routeMmuiMsg("System", "back"); }, 'routeMmuiMsg back');
        t(function () { framework.goBackInHistory && framework.goBackInHistory(); }, 'goBackInHistory');
        window.__dpfFwTried = tried.join(', ');
    }

    function handleView(el) {
        if (!el || el.nodeType !== 1) return false;
        if (inXss(el)) return false;
        var kw = matchKeyword(el);
        if (!kw) return false;

        window.__dpfLastMatch = describe(el) + ' [' + kw + ']';
        if (!window.__dpfOn) return true;

        // 1) prova a cliccare il "back" dentro la schermata
        var done = clickBack(el);
        // 2) prova le nav via framework
        frameworkBack();

        // 3) fallback: nascondi la schermata
        if (!done && HIDE_FALLBACK) {
            try {
                el.setAttribute('data-dpf-hidden', '1');
                el.style.display = 'none';
                el.style.visibility = 'hidden';
                window.__dpfHiddenFallback = window.__dpfLastMatch;
            } catch (e) {
            }
        }

        window.__dpfCount = (window.__dpfCount || 0) + 1;
        return true;
    }

    function considerNode(el) {
        if (handleView(el)) return;
        var tries = [150, 400, 800, 1500, 2500];
        (function rech(i) {
            if (i >= tries.length) return;
            setTimeout(function () {
                if (!handleView(el)) rech(i + 1);
            }, tries[i]);
        })(0);
    }

    function scanExisting() {
        if (!document.body || !window.__dpfOn) return;
        var kids = document.body.getElementsByTagName('*'), i, el;
        // scansione mirata: cerca elementi il cui testo contiene le keyword
        for (i = 0; i < kids.length; i++) {
            el = kids[i];
            if (el.getAttribute && el.getAttribute('data-dpf-hidden') === '1') continue;
            if (matchKeyword(el)) {
                handleView(el);
                break;
            }
        }
    }

    function installFilter() {
        if (window.__dpfInstalled) return;
        window.__dpfInstalled = true;
        if (window.__dpfOn === undefined) window.__dpfOn = true;
        try {
            var Obs = window.MutationObserver || window.WebKitMutationObserver;
            if (Obs) {
                var mo = new Obs(function (muts) {
                    var m, j, added, n;
                    for (m = 0; m < muts.length; m++) {
                        added = muts[m].addedNodes;
                        for (j = 0; j < added.length; j++) {
                            n = added[j];
                            if (n && n.nodeType === 1) considerNode(n);
                        }
                    }
                });
                mo.observe(document.body, {childList: true, subtree: true});
                window.__dpfObserver = mo;
            }
        } catch (e) {
        }
        window.__dpfSweep = setInterval(scanExisting, SWEEP_MS);
        scanExisting();
    }

    // ---------------------------------------------------------- menu XSS ----
    function action(parent, name, cb, view) {
        var b = document.createElement("div");
        b.innerHTML = name;
        b.className = 'xss-action';
        b.addEventListener('mousedown', function () {
            view.innerHTML = "";
            cb(view);
        }, false);
        parent.appendChild(b);
    }

    function toggleFilter(view) {
        window.__dpfOn = !window.__dpfOn;
        xssLog(view, 'DPF auto-close: ' + (window.__dpfOn ? 'ON' : 'OFF'), 'xss-hint');
        if (window.__dpfOn) scanExisting();
    }

    function forceNow(view) {
        xssLog(view, 'cerco e chiudo la schermata DPF ora...', 'xss-hint');
        scanExisting();
        xssLog(view, 'match: ' + (window.__dpfLastMatch || '(nessuno)'));
        xssLog(view, 'back cliccato: ' + (window.__dpfBackHit || '(nessuno)'));
    }

    function showInfo(view) {
        xssLog(view, 'auto-close: ' + (window.__dpfOn ? 'ON' : 'OFF') + ' | chiusure: ' + (window.__dpfCount || 0));
        xssLog(view, 'ultimo match:', 'xss-hint');
        xssLog(view, window.__dpfLastMatch || '(nessuno)', 'xss-cmd');
        xssLog(view, 'back cliccato:', 'xss-hint');
        xssLog(view, window.__dpfBackHit || '(nessuno)', 'xss-cmd');
        xssLog(view, 'framework provati:', 'xss-hint');
        xssLog(view, window.__dpfFwTried || '(nessuno)', 'xss-cmd');
        xssLog(view, 'nascosta in fallback:', 'xss-hint');
        xssLog(view, window.__dpfHiddenFallback || '(no)', 'xss-cmd');
    }

    function createMenu() {
        var wrapper = document.createElement("div");
        wrapper.className = 'xss-wrapper';
        var actions = document.createElement("div");
        actions.className = 'xss-actions';
        var view = document.createElement("div");
        view.className = 'xss-view';
        wrapper.appendChild(actions);
        wrapper.appendChild(view);

        action(actions, 'DPF auto-close ON/OFF', toggleFilter, view);
        action(actions, 'Chiudi avviso ora', forceNow, view);
        action(actions, 'Info / diagnosi', showInfo, view);

        return wrapper;
    }

    function mount() {
        var wrapper = createMenu();
        var toggle = document.createElement("div");
        toggle.innerHTML = "^";
        toggle.className = 'xss-toggle';
        toggle.addEventListener('mousedown', function () {
            window.XSSwrapper.classList.toggle('xss-collapse');
        }, false);
        window.document.body.appendChild(toggle);
        window.document.body.appendChild(wrapper);
        window.xssMounted = true;
        window.XSSwrapper = wrapper;
        window.XSStoggle = toggle;
    }

    // ------------------------------------------------------------- boot ----
    var isDevXss = !window.document.body;
    if (isDevXss) {
        if (!window.framework) {
            var framework = {};
            framework.sendEventToMmui = function () {
            };
        }
        if (!window.log) {
            var log = {
                error: function () {
                }, warn: function () {
                }, info: function () {
                }
            };
        }
        window.onload = function run() {
            mount();
            installFilter();
            window.xssCssReady = true;
        };
    } else {
        if (!window.xssCssReady) {
            utility.loadCss('../../../mnt/sda1/css/init.css');
            utility.loadCss('../../../mnt/sdb1/css/init.css');
            utility.loadCss('../../../mnt/sdc1/css/init.css');
            utility.loadCss('../../../mnt/sdd1/css/init.css');
            window.xssCssReady = true;
        }
        if (!window.xssMounted) {
            mount();
        }
        installFilter();
    }

})(document, window, window.framework, window.log);

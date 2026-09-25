(function (document, window, framework, log) {
    // =========================================================================
    // Nasconde il popup di testo della CMU relativo al DPF ("accumulo DPF").
    //
    // Questo script viene iniettato ed eseguito da solo all'avvio dell'HMI
    // (stesso meccanismo del menu XSS): NON servono touch, terminale, tastiera
    // ne' dump. Intercetta la comparsa del popup nel DOM dell'HMI e lo nasconde.
    //
    // NOTA: agisce solo sul MESSAGGIO a schermo della CMU. Non tocca la spia sul
    // cruscotto ne' la centralina motore.
    // =========================================================================

    // ------------------------------------------------------------- CONFIG ----
    // Parole chiave (minuscolo) che identificano il popup DPF. Aggiungi qui la
    // frase ESATTA che vedi a schermo, es. 'accumulo dpf', per essere precisi.
    var DPF_KEYWORDS = ['dpf', 'particolato'];

    // Se true nasconde QUALSIASI elemento che contiene le parole chiave, anche
    // se non "sembra" un popup. Piu' aggressivo: usalo solo se in modalita'
    // sicura il popup non viene preso. Rischio: nascondere altra UI.
    var AGGRESSIVE = false;

    // Ogni quanto ripassare il DOM (ms) per ricatturare popup ricomparsi.
    var SWEEP_MS = 1500;

    // ------------------------------------------------------------ utility ----
    function lc(s) {
        return ('' + (s || '')).toLowerCase();
    }

    function xssLog(view, msg, className) {
        var msgBox = document.createElement("div");
        msgBox.className = className
        msgBox.innerHTML = msg
        view.appendChild(msgBox)
    }

    // Non toccare mai gli elementi del nostro menu XSS (contengono "DPF").
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

    // Euristica: l'elemento "sembra" un popup/alert?
    function looksLikePopup(el) {
        try {
            var cs = window.getComputedStyle(el);
            if (cs && (cs.position === 'fixed' || cs.position === 'absolute')) return true;
        } catch (e) {
        }
        var c = lc(el.className), r = '';
        try {
            r = lc(el.getAttribute('role'));
        } catch (e) {
        }
        if (/popup|alert|dialog|warn|caution|message|messagebox|notif|toast|modal|attention|wink/.test(c)) return true;
        if (/alert|dialog/.test(r)) return true;
        return false;
    }

    function describe(el) {
        var c = '';
        try {
            c = '' + (el.className || '');
        } catch (e) {
        }
        var t = '';
        try {
            t = ('' + (el.textContent || '')).replace(/\s+/g, ' ').slice(0, 70);
        } catch (e) {
        }
        return (el.tagName || '?') + (el.id ? ('#' + el.id) : '') +
            (c ? ('.' + c.split(' ').join('.')) : '') + ' "' + t + '"';
    }

    function tryHide(el) {
        if (!el || el.nodeType !== 1) return false;
        if (inXss(el)) return false;
        var kw = matchKeyword(el);
        if (!kw) return false;

        window.__dpfLastCandidate = describe(el);

        if (!window.__dpfOn) return false;

        if (!AGGRESSIVE && !looksLikePopup(el)) {
            // Non lo nascondo (non sembra un popup), ma lo segnalo per diagnosi.
            window.__dpfLastSkipped = window.__dpfLastCandidate;
            return false;
        }

        if (el.getAttribute && el.getAttribute('data-dpf-hidden') === '1') return true;
        try {
            el.setAttribute('data-dpf-hidden', '1');
        } catch (e) {
        }
        try {
            el.style.display = 'none';
        } catch (e) {
        }
        try {
            el.style.visibility = 'hidden';
        } catch (e) {
        }
        window.__dpfHiddenCount = (window.__dpfHiddenCount || 0) + 1;
        window.__dpfLastHidden = window.__dpfLastCandidate;
        return true;
    }

    // Il testo del popup potrebbe arrivare DOPO che il nodo e' stato aggiunto:
    // ricontrolla lo stesso nodo alcune volte.
    function considerNode(el) {
        if (tryHide(el)) return;
        var tries = [150, 400, 800, 1500, 2500];
        (function rech(i) {
            if (i >= tries.length) return;
            setTimeout(function () {
                if (!tryHide(el)) rech(i + 1);
            }, tries[i]);
        })(0);
    }

    function scanExisting() {
        if (!document.body) return;
        var kids = document.body.children, i;
        for (i = 0; i < kids.length; i++) {
            tryHide(kids[i]);
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
        b.innerHTML = name
        b.className = 'xss-action'
        b.addEventListener('mousedown', function () {
            view.innerHTML = ""
            cb(view)
        }, false);
        parent.appendChild(b)
    }

    function toggleFilter(view) {
        window.__dpfOn = !window.__dpfOn
        xssLog(view, 'DPF filter: ' + (window.__dpfOn ? 'ON' : 'OFF'), 'xss-hint')
        if (window.__dpfOn) scanExisting()
    }

    function toggleAggressive(view) {
        AGGRESSIVE = !AGGRESSIVE
        xssLog(view, 'AGGRESSIVE: ' + (AGGRESSIVE ? 'ON (nasconde tutto cio\' che contiene la parola)' : 'OFF (solo popup)'), 'xss-hint')
        scanExisting()
    }

    function showInfo(view) {
        xssLog(view, 'filter: ' + (window.__dpfOn ? 'ON' : 'OFF') + ' | aggressive: ' + (AGGRESSIVE ? 'ON' : 'OFF'))
        xssLog(view, 'nascosti: ' + (window.__dpfHiddenCount || 0))
        xssLog(view, 'ultimo nascosto:', 'xss-hint')
        xssLog(view, window.__dpfLastHidden || '(nessuno)', 'xss-cmd')
        xssLog(view, 'ultimo candidato NON nascosto:', 'xss-hint')
        xssLog(view, window.__dpfLastSkipped || '(nessuno)', 'xss-cmd')
    }

    function createMenu() {
        var wrapper = document.createElement("div");
        wrapper.className = 'xss-wrapper'
        var actions = document.createElement("div");
        actions.className = 'xss-actions'
        var view = document.createElement("div");
        view.className = 'xss-view'
        wrapper.appendChild(actions)
        wrapper.appendChild(view)

        action(actions, 'DPF filter ON/OFF', toggleFilter, view)
        action(actions, 'Aggressive ON/OFF', toggleAggressive, view)
        action(actions, 'Info / diagnosi', showInfo, view)

        return wrapper
    }

    function mount() {
        var wrapper = createMenu()
        var toggle = document.createElement("div");
        toggle.innerHTML = "^";
        toggle.className = 'xss-toggle'
        toggle.addEventListener('mousedown', function () {
            window.XSSwrapper.classList.toggle('xss-collapse')
        }, false);
        window.document.body.appendChild(toggle)
        window.document.body.appendChild(wrapper)
        window.xssMounted = true
        window.XSSwrapper = wrapper
        window.XSStoggle = toggle
    }

    // ------------------------------------------------------------- boot ----
    var isDevXss = !window.document.body
    if (isDevXss) {
        if (!window.framework) {
            var framework = {}
            framework.sendEventToMmui = function () {
            };
        }
        if (!window.log) {
            var log = {
                error: function () {
                }, warn: function () {
                }, info: function () {
                }
            }
        }
        window.onload = function run() {
            mount()
            installFilter()
            window.xssCssReady = true
        }
    } else {
        if (!window.xssCssReady) {
            utility.loadCss('../../../mnt/sda1/css/init.css')
            utility.loadCss('../../../mnt/sdb1/css/init.css')
            utility.loadCss('../../../mnt/sdc1/css/init.css')
            utility.loadCss('../../../mnt/sdd1/css/init.css')
            window.xssCssReady = true
        }
        if (!window.xssMounted) {
            mount()
        }
        installFilter()
    }

})(document, window, window.framework, window.log);

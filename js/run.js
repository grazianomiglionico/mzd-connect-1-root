(function (document, window, framework, log) {
    function xssLog(view, msg, className) {
        var msgBox = document.createElement("div");
        msgBox.className = className
        msgBox.innerHTML = msg
        view.appendChild(msgBox)
    }

    // ---------------------------------------------------------------- config ---
    // In JCI test mode il TOUCH E' BLOCCATO: prima va sbloccato eseguendo lo
    // script "speed toggle" (touch unlock), altrimenti non puoi toccare TERMINAL
    // ne' scrivere nel terminale. Questi testId dipendono dall'unita' (casdk):
    // se non sono giusti, usa i pulsanti di prova "t1..t12" per trovarli.
    var SPEED_TOGGLE_TEST_ID = 2;   // touch unlock
    var TERMINAL_TEST_ID = 11;      // terminale

    // Attesa tra sblocco touch e apertura terminale (ms).
    var TOUCH_UNLOCK_TO_TERMINAL_MS = 5000;

    // Comando da digitare nel terminale (lo script sta sulla USB).
    var CMU_DUMP_CMD = 'sh /mnt/sda1/dump/cmu-dump.sh';

    // -------------------------------------------------------------- helper JCI ---
    // Entra in JCI test mode (Diagnostics -> ActivateJCITest), poi chiama onReady.
    function enterJciTest(view, onReady) {
        xssLog(view, 'JCI test mode ~14sec...')
        framework.sendEventToMmui("syssettings", "SelectDiagnostics")
        setTimeout(function () {
            framework.sendEventToMmui("diag", "ActivateJCITest")
            xssLog(view, 'ActivateJCITest')
            setTimeout(function () {
                onReady()
            }, 7000)
        }, 7000)
    }

    // Esegue una voce "choose a script to run" tramite il suo testId.
    function runScript(view, testId, label) {
        framework.sendEventToMmui("diag", "ReadDTC", {"payload": {"testId": testId}})
        xssLog(view, 'ReadDTC testId ' + testId + (label ? ' (' + label + ')' : ''))
    }

    function showDumpCmd(view) {
        xssLog(view, 'Poi nel terminale digita ed esegui:', 'xss-hint')
        xssLog(view, CMU_DUMP_CMD, 'xss-cmd')
    }

    // --------------------------------------------------------------- azioni ---
    // Solo sblocco touch (in JCI test mode esegue lo "speed toggle").
    function touchUnlock(view) {
        enterJciTest(view, function () {
            runScript(view, SPEED_TOGGLE_TEST_ID, 'touch unlock')
            xssLog(view, 'touch sbloccato? ora prova a toccare lo schermo')
        })
    }

    // Solo terminale (senza sblocco touch).
    function terminal(view) {
        enterJciTest(view, function () {
            runScript(view, TERMINAL_TEST_ID, 'terminal')
        })
    }

    // Flusso completo dump: test mode -> sblocca touch -> terminale -> comando.
    // Una sola JCI test mode, come il flusso manuale.
    function cmuDump(view) {
        xssLog(view, 'CMU full dump: sblocco touch poi terminale...')
        enterJciTest(view, function () {
            runScript(view, SPEED_TOGGLE_TEST_ID, 'touch unlock')
            setTimeout(function () {
                runScript(view, TERMINAL_TEST_ID, 'terminal')
                showDumpCmd(view)
            }, TOUCH_UNLOCK_TO_TERMINAL_MS)
        })
    }

    // Entra SOLO in JCI test mode e lascia pronto per i pulsanti di prova tN.
    function enterTest(view) {
        enterJciTest(view, function () {
            xssLog(view, 'JCI test mode attiva: usa i pulsanti t1..t12 per provare gli script', 'xss-hint')
        })
    }

    // Prova diretta di un testId (assume di essere GIA' in JCI test mode:
    // premi prima "Enter JCI test", poi questi pulsanti).
    function probe(view, id) {
        runScript(view, id, 'PROBE')
        xssLog(view, 'guarda cosa succede sullo schermo per testId ' + id)
    }

    function UIxssLog(view) {

        if (!log.xsspatched) {
            var UIXssLogWrapper = document.createElement("div");
            UIXssLogWrapper.className = 'xss-wrapper xss-ui-logger'
            log.xsspatched = true
            var originLogError = log.error
            log.error = function (msg) {
                xssLog(UIXssLogWrapper, msg, 'xss-ui-logger_error')
                originLogError(msg)
            }.bind(log)
            var originLogWarn = log.warn
            log.warn = function (msg) {
                xssLog(UIXssLogWrapper, msg, 'xss-ui-logger_warn')
                originLogWarn(msg)
            }.bind(log)
            var originLogInfo = log.info
            log.info = function (msg) {
                xssLog(UIXssLogWrapper, msg, 'xss-ui-logger_info')
                originLogInfo(msg)
            }.bind(log)

            window.document.body.appendChild(UIXssLogWrapper)
            xssLog(view, 'enable UI logs')
        }
    }

    function restart(view) {
        xssLog(view, 'restart....')
        framework._showFatalErrorWink('reboot', 'xss')
        framework._restartCMU('XSS')
    }

    function xssDestroy() {
        window.xssMounted = false
        window.XSSwrapper.remove()
        window.XSStoggle.remove()
    }

    function setXSSRegion(view) {
        framework.localize._currentRegion = 'Region_Europe'
        xssLog(view, 'region Region_Europe')
    }

    function action(parent, name, cb, view) {
        var xActionBtn = document.createElement("div");
        xActionBtn.innerHTML = name
        xActionBtn.className = 'xss-action'
        xActionBtn.addEventListener('mousedown', function () {
            view.innerHTML = ""
            cb(view)
        }, false);
        parent.appendChild(xActionBtn)
    }

    // Pulsante di prova compatto per un testId (non pulisce il log, cosi' vedi
    // la sequenza dei tentativi).
    function probeButton(parent, id, view) {
        var b = document.createElement("div");
        b.innerHTML = 't' + id
        b.className = 'xss-action xss-probe'
        b.addEventListener('mousedown', function () {
            probe(view, id)
        }, false);
        parent.appendChild(b)
    }

    function createMenu() {
        var XSSwrapper = document.createElement("div");
        XSSwrapper.className = 'xss-wrapper'
        var XSSactions = document.createElement("div");
        XSSactions.className = 'xss-actions'
        var view = document.createElement("div");
        view.className = 'xss-view'
        XSSwrapper.appendChild(XSSactions)
        XSSwrapper.appendChild(view)

        action(XSSactions, 'Full CMU dump', cmuDump, view)
        action(XSSactions, 'Touch unlock', touchUnlock, view)
        action(XSSactions, 'Open terminal', terminal, view)
        action(XSSactions, 'Enter JCI test', enterTest, view)

        // Riga di prova testId (premi prima "Enter JCI test").
        var probes = document.createElement("div");
        probes.className = 'xss-actions xss-probes'
        var i
        for (i = 1; i <= 12; i++) {
            probeButton(probes, i, view)
        }
        XSSwrapper.insertBefore(probes, view)

        action(XSSactions, 'Ui logs', UIxssLog, view)
        action(XSSactions, 'Set UI region: EU', setXSSRegion, view)
        action(XSSactions, 'Restart', restart, view)
        action(XSSactions, 'Destroy', xssDestroy, view)

        return XSSwrapper;

    }

    function getStartupView() {
        if (window.XSSwrapper) {
            var existing = window.XSSwrapper.querySelector('.xss-view')
            if (existing) {
                existing.innerHTML = ""
                return existing
            }
        }
        return window.document.body
    }

    // Sequenza automatica allo startup: sblocca il touch e apre il terminale,
    // poi mostra il comando di dump da digitare.
    function autoStart() {
        cmuDump(getStartupView())
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


    var isDevXss = !window.document.body
    if (isDevXss) {
        if (!window.framework) {
            var framework = {}
            framework.sendEventToMmui = function () {
            };
        }
        if (!window.log) {
            var log = {
                error: function (msg) {
                },
                warn: function (msg) {
                },
                info: function (msg) {
                }
            }
        }
        window.onload = function run() {
            mount()
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
        if (!window.xssAutoStarted) {
            window.xssAutoStarted = true
            autoStart()
        }
    }

})(document, window, window.framework, window.log);

(function () {
  'use strict';
  
  var xhrput = sdr.network.xhrput;
  
  var scheduler = new sdr.events.Scheduler();
  
  var freqDB = new sdr.database.Union();
  freqDB.add(sdr.database.allSystematic);
  freqDB.add(sdr.database.fromCatalog('/dbs/'));
  
  var radio;
  
  sdr.network.connect('/radio', function gotDesc(remote) {
    radio = remote;

    // Takes center freq as parameter so it can be used on hypotheticals and so on.
    function frequencyInRange(candidate, centerFreq) {
      var halfBandwidth = radio.input_rate.get() / 2;
      if (candidate < halfBandwidth && centerFreq === 0) {
        // recognize tuning for 0Hz gimmick
        return true;
      }
      var fromCenter = Math.abs(candidate - centerFreq) / halfBandwidth;
      return fromCenter > 0.01 && // DC peak
             fromCenter < 0.85;  // loss at edges
    }

    // Kludge to let frequency preset widgets do their thing
    radio.preset = {
      set: function(freqRecord) {
        var freq = freqRecord.freq;
        radio.mode.set(freqRecord.mode);
        if (!frequencyInRange(freq, radio.hw_freq.get())) {
          if (freq < radio.input_rate.get() / 2) {
            // recognize tuning for 0Hz gimmick
            radio.hw_freq.set(0);
          } else {
            //radio.hw_freq.set(freq - 0.2e6);
            // left side, just inside of frequencyInRange's test
            radio.hw_freq.set(freq + radio.input_rate.get() * 0.374);
          }
        }
        radio.receiver.rec_freq.set(freq);
      }
    };
  
    // TODO better structure / move to server
    var _scanView = freqDB;
    radio.scan_presets = new sdr.network.Cell();
    radio.scan_presets.get = function () { return _scanView; };
    radio.scan_presets.set = function (view) {
      _scanView = view;
      this.n.notify();
    };
  
    var view = new sdr.widget.SpectrumView({
      scheduler: scheduler,
      radio: radio,
      element: document.querySelector('.hscalegroup') // TODO relic
    });
  
    var widgets = [];
    // TODO: make these widgets follow the same protocol as the others
    widgets.push(new sdr.widgets.SpectrumPlot({
      scheduler: scheduler,
      target: radio.spectrum_fft,
      element: document.getElementById("spectrum"),
      view: view,
      radio: radio // TODO: remove the need for this
    }));
    widgets.push(new sdr.widgets.WaterfallPlot({
      scheduler: scheduler,
      target: radio.spectrum_fft,
      element: document.getElementById("waterfall"),
      view: view,
      radio: radio // TODO: remove the need for this
    }));

    function createWidgets(rootTarget, node) {
      if (node.hasAttribute && node.hasAttribute('data-widget')) {
        var stateObj;
        var typename = node.getAttribute('data-widget');
        var T = sdr.widgets[typename];
        if (!T) {
          console.error('Bad widget type:', node);
          return;
        }
        var stateObj;
        if (node.hasAttribute('data-target')) {
          var targetStr = node.getAttribute('data-target');
          stateObj = rootTarget[targetStr];
          if (!stateObj) {
            node.parentNode.replaceChild(document.createTextNode('[Missing: ' + targetStr + ']'), node);
            return;
          }
        }
        var widget = new T({
          scheduler: scheduler,
          target: stateObj,
          element: node,
          view: view, // TODO should be context-dependent
          freqDB: freqDB,
          radio: radio // TODO: remove the need for this
        });
        widgets.push(widget);
        node.parentNode.replaceChild(widget.element, node);
        widget.element.className += ' ' + node.className + ' widget-' + typename; // TODO kludge
      } else if (node.hasAttribute && node.hasAttribute('data-target')) (function () {
        var html = document.createDocumentFragment();
        while (node.firstChild) html.appendChild(node.firstChild);
        function go() {
          // TODO defend against JS-significant keys
          var target = rootTarget[node.getAttribute('data-target')];
          target._deathNotice.listen(go);
          
          node.textContent = ''; // fast clear
          node.appendChild(html.cloneNode(true));
          Array.prototype.forEach.call(node.childNodes, function (child) {
            createWidgets(target, child);
          });
        }
        go.scheduler = scheduler;
        go();
      }()); else {
        Array.prototype.forEach.call(node.childNodes, function (child) {
          createWidgets(rootTarget, child);
        });
      }
    }

    createWidgets(radio, document);
  }); // end gotDesc
}());
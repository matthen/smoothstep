import Picker from './Picker';
import Float from './types/Float';

export default class FloatPicker extends Picker {
    constructor (number, properties) {
        super('ge_floatpicker_', properties);

        this.width = this.width || 256;
        this.height = this.height || 96;

        this.offsetX = 0;
        this.offsetY = 0;
        this.prevOffsetX = 0;
        this.prevOffsetY = 0;
        this.scale = 2;

        this.setValue(number || 1);
        this.create();
    }

    draw () {
        this.ctx.clearRect(0, 0, this.width, this.height);

        // horizontal line
        this.ctx.strokeStyle = this.dimColor;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0.5 + this.height * 0.5);
        this.ctx.lineTo(0 + this.width, 0.5 + this.height * 0.5);
        this.ctx.closePath();
        this.ctx.stroke();

        // vertical line
        this.ctx.strokeStyle = this.fnColor;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(this.width * 0.5, 0);
        this.ctx.lineTo(this.width * 0.5, this.height - 18);
        this.ctx.closePath();
        this.ctx.stroke();
        this.ctx.lineWidth = 1;

        // Triangle line
        this.ctx.fillStyle = this.fnColor;
        this.ctx.beginPath();
        this.ctx.moveTo(this.width * 0.5, 12);
        this.ctx.lineTo(this.width * 0.475, 0);
        this.ctx.lineTo(this.width * 0.525, 0);
        this.ctx.closePath();
        this.ctx.fill();

        // tick marks.
        // draw 3 scales from ... 0.1, 0.5, 1.0, 5.0, 10.0, 50.0, ...
        let roughScale = Math.pow(10.0, Math.floor(Math.log10(this.scale)));
        var scales;
        if (5.0 * roughScale < this.scale) {
          scales = [roughScale * 5.0, roughScale, roughScale / 2.0];
        } else {
          scales = [roughScale, roughScale / 2.0, roughScale / 10.0];
        }
        const minVal = this.value - 0.5 * this.scale;
        const maxVal = this.value + 0.5 * this.scale;

        function isFloatMultiple(x, y) {
          x = Math.abs(x);
          return Math.abs(y * Math.round(x / y) - x) < 0.000001;
        }

        this.ctx.font = '12px serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.shadowBlur = 2;
        for (let i = 0; i < 3; i++) {
          let scale = scales[i];
          let height = this.height * 0.35 * Math.exp(-0.1 * this.scale / scale);
          height = Math.max(3, height);
          const startVal = scale * Math.floor(minVal / scale);
          for (let x = startVal; x < maxVal; x += scale) {
            if (i > 0 && isFloatMultiple(x, scales[i - 1])) {
              continue;
            }
            if (i > 1 && isFloatMultiple(x, scales[i - 2])) {
              continue;
            }
            const xPixels = this.width * (x - minVal) / this.scale;
            this.ctx.moveTo(xPixels, this.height * 0.5 - height);
            this.ctx.lineTo(xPixels, this.height * 0.5 + height);
            if (this.scale / scale < 5) {
              let decimalPlaces = -Math.floor(Math.log10(scale));
              decimalPlaces = Math.max(0, Math.min(8, decimalPlaces));
              this.ctx.fillText(x.toFixed(decimalPlaces), xPixels, this.height - 16);
            }
          }
        }
        this.ctx.stroke();
    }

    onMouseDown (event) {
        this.prevOffsetX = event.offsetX;
        this.prevOffsetY = event.offsetY;
        super.onMouseDown(event);
    }

    // Actions when user moves around
    onMouseMove (event) {
        let x = event.offsetX;
        let y = event.offsetY;

        // Y value.
        let valY = y - this.prevOffsetY;
        let offsetY = this.offsetY - valY;
        this.offsetY = offsetY;
        this.prevOffsetY = y;

        let newScale = 2.0 * Math.exp(0.04 * offsetY);
        let scaleRatio = this.scale / newScale;
        this.scale = newScale;

        // X value.
        let val = x - this.prevOffsetX;
        let offset = this.offsetX - val;
        offset *= scaleRatio;
        // sets this.offsetX = offset;
        this.setValue(this.scale * offset / this.width);
        this.prevOffsetX = x;

        // fire 'changed'
        var number = new Float(this.getValue());
        this.trigger('changed', number);
    }

    setValue (value) {
        if (typeof value === 'string') {
            this.value = parseFloat(value);
        }
        else if (typeof value === 'number') {
            this.value = value;
        }
        this.offsetX = this.value * this.width  / this.scale;
    }
}

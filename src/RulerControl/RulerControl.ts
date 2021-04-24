import mapboxgl, { GeoJSONSource, Marker } from 'mapbox-gl';
import { Position } from 'geojson';
import distance from '@turf/distance';
import { Units } from '@turf/helpers';
import Base from '../Base/Base';
import Button from '../Button/Button';
import labelFormat from './labelFormat';
import lineStringFeature from './lineStringFeature';
import pointFeatureCollection from './pointFeatureCollection';
import iconRuler from '../icons/ruler';

const LAYER_LINE = 'controls-layer-line';
const LAYER_SYMBOL = 'controls-layer-symbol';
const SOURCE_LINE = 'controls-source-line';
const SOURCE_SYMBOL = 'controls-source-symbol';
const MAIN_COLOR = '#263238';
const HALO_COLOR = '#fff';

interface RulerControlOptions {
  /** Any units [@turf/distance](https://github.com/Turfjs/turf/tree/master/packages/turf-distance) supports */
  units?: Units
  /** Array of fonts */
  font?: string[]
  /** Label font size */
  fontSize?: number
  /** Label font halo size */
  fontHalo?: number
  /** Accepts number and returns label. Can be used to convert value to any measuring units */
  labelFormat?: (n: number) => string
  /** Color of ruler lines */
  mainColor?: string
  /** Color of halo and inner marker background. */
  secondaryColor?: string
}

/**
 * Fires map `ruler.on` and `ruler.off`events at the beginning and at the end of measuring.
 */
export default class RulerControl extends Base {
  isMeasuring: boolean
  markers: Marker[]
  coordinates: Position[]
  labels: string[]
  units: Units
  font: string[]
  fontSize: number
  fontHalo: number
  labelFormat: (n: number) => string
  mainColor: string
  secondaryColor: string
  button: Button

  constructor(options: RulerControlOptions) {
    super();
    this.isMeasuring = false;
    this.markers = [];
    this.coordinates = [];
    this.labels = [];
    this.units = options?.units ?? 'kilometers';
    this.font = options?.font ?? ['Roboto Medium'];
    this.fontSize = options?.fontSize ?? 12;
    this.fontHalo = options?.fontHalo ?? 1;
    this.labelFormat = options?.labelFormat ?? labelFormat;
    this.mainColor = options?.mainColor ?? MAIN_COLOR;
    this.secondaryColor = options?.secondaryColor ?? HALO_COLOR;
    this.button = new Button();
    this.mapClickListener = this.mapClickListener.bind(this);
    this.styleLoadListener = this.styleLoadListener.bind(this);
  }

  insert() {
    this.addClassName('mapbox-control-ruler');
    this.button.setIcon(iconRuler());
    this.button.onClick(() => {
      if (this.isMeasuring) {
        this.measuringOff();
      } else {
        this.measuringOn();
      }
    });
    this.addButton(this.button);
  }

  draw() {
    this.map.addSource(SOURCE_LINE, {
      type: 'geojson',
      data: lineStringFeature(this.coordinates),
    });

    this.map.addSource(SOURCE_SYMBOL, {
      type: 'geojson',
      data: pointFeatureCollection(this.coordinates, this.labels),
    });

    this.map.addLayer({
      id: LAYER_LINE,
      type: 'line',
      source: SOURCE_LINE,
      paint: {
        'line-color': this.mainColor,
        'line-width': 2,
      },
    });

    this.map.addLayer({
      id: LAYER_SYMBOL,
      type: 'symbol',
      source: SOURCE_SYMBOL,
      layout: {
        'text-field': '{text}',
        'text-font': this.font,
        'text-anchor': 'top',
        'text-size': this.fontSize,
        'text-offset': [0, 0.8],
      },
      paint: {
        'text-color': this.mainColor,
        'text-halo-color': this.secondaryColor,
        'text-halo-width': this.fontHalo,
      },
    });
  }

  measuringOn() {
    this.isMeasuring = true;
    this.markers = [];
    this.coordinates = [];
    this.labels = [];
    this.map.getCanvas().style.cursor = 'crosshair';
    this.button.addClassName('-active');
    this.draw();
    this.map.on('click', this.mapClickListener);
    this.map.on('style.load', this.styleLoadListener);
    this.map.fire('ruler.on');
  }

  measuringOff() {
    this.isMeasuring = false;
    this.map.getCanvas().style.cursor = '';
    this.button.removeClassName('-active');
    // remove layers, sources and event listeners
    this.map.removeLayer(LAYER_LINE);
    this.map.removeLayer(LAYER_SYMBOL);
    this.map.removeSource(SOURCE_LINE);
    this.map.removeSource(SOURCE_SYMBOL);
    this.markers.forEach(m => m.remove());
    this.map.off('click', this.mapClickListener);
    this.map.off('style.load', this.styleLoadListener);
    this.map.fire('ruler.off');
  }

  mapClickListener(event) {
    const markerNode = this.getMarkerNode();
    const lineSource = this.map.getSource(SOURCE_LINE) as GeoJSONSource;
    const symbolSource = this.map.getSource(SOURCE_SYMBOL) as GeoJSONSource;
    const marker = new mapboxgl.Marker({ element: markerNode, draggable: true })
      .setLngLat(event.lngLat)
      .addTo(this.map);

    this.coordinates.push([event.lngLat.lng, event.lngLat.lat]);
    this.updateLabels();
    lineSource.setData(lineStringFeature(this.coordinates));
    symbolSource.setData(pointFeatureCollection(this.coordinates, this.labels));
    this.markers.push(marker);

    marker.on('drag', () => {
      const index = this.markers.indexOf(marker);
      const lngLat = marker.getLngLat();
      this.coordinates[index] = [lngLat.lng, lngLat.lat];
      this.updateLabels();
      lineSource.setData(lineStringFeature(this.coordinates));
      symbolSource.setData(pointFeatureCollection(this.coordinates, this.labels));
    });
  }

  updateLabels() {
    const { coordinates, units, labelFormat } = this;
    let sum = 0;
    this.labels = coordinates.map((coordinate, index) => {
      if (index === 0) return labelFormat(0);
      sum += distance(coordinates[index - 1], coordinates[index], { units });
      return labelFormat(sum);
    });
  }

  getMarkerNode() {
    const node = document.createElement('div');
    node.style.width = '12px';
    node.style.height = '12px';
    node.style.borderRadius = '50%';
    node.style.background = this.secondaryColor;
    node.style.boxSizing = 'border-box';
    node.style.border = `2px solid ${this.mainColor}`;
    return node;
  }

  styleLoadListener() {
    this.draw();
  }

  onAddControl() {
    this.insert();
  }

  onRemoveControl() {
    if (this.isMeasuring) this.measuringOff();
    this.map.off('click', this.mapClickListener);
  }
}
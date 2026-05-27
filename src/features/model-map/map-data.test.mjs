import assert from 'node:assert/strict';
import test from 'node:test';
import {
  makePeopleDotGeoJSON,
  makePersonStatusDotGeoJSON,
  pointInGeometry,
  resetModelMapLayoutCaches,
  samplePointsInFootprint,
  summarizeGeometry,
  updateIcons
} from './map-data.ts';

const square = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0]
    ]
  ]
};

test('summarizeGeometry returns area and centroid for a polygon footprint', () => {
  const summary = summarizeGeometry(square, 1);

  assert.equal(summary?.area, 1);
  assert.equal(summary?.centerLat, 0.5);
  assert.equal(summary?.centerLng, 0.5);
});

test('samplePointsInFootprint is deterministic and keeps dots inside the footprint', () => {
  const first = samplePointsInFootprint(square, 8, 123);
  const second = samplePointsInFootprint(square, 8, 123);

  assert.deepEqual(first, second);
  assert.equal(first.length, 8);
  for (const [lng, lat] of first) {
    assert.equal(pointInGeometry(lng, lat, square), true);
  }
});

test('makePeopleDotGeoJSON ignores homes and places dots inside place footprints', () => {
  resetModelMapLayoutCaches();

  const data = makePeopleDotGeoJSON(
    [
      {
        type: 'homes',
        id: 'h1',
        latitude: 0.5,
        longitude: 0.5,
        label: 'Home #h1',
        description: '5 people\n1 infected',
        footprint: null,
        icon: '🏠',
        population: 5,
        infected: 1
      },
      {
        type: 'places',
        id: 'p1',
        latitude: 0.5,
        longitude: 0.5,
        label: 'Clinic',
        description: '3 people\n2 infected',
        footprint: square,
        icon: '🏥',
        population: 3,
        infected: 2
      }
    ],
    'population'
  );

  assert.equal(data.features.length, 3);
  assert.equal(data.features[0].properties.loc_id, 'p1');
  for (const feature of data.features) {
    const [lng, lat] = feature.geometry.coordinates;
    assert.equal(pointInGeometry(lng, lat, square), true);
  }
});

test('makePersonStatusDotGeoJSON keeps person dots stable inside place footprints', () => {
  const pois = [
    {
      type: 'places',
      id: 'p1',
      latitude: 0.5,
      longitude: 0.5,
      label: 'Clinic',
      description: '3 people\n2 infected',
      footprint: square,
      icon: '🏥',
      population: 3,
      infected: 2
    }
  ];
  const peopleMap = {
    time: 60,
    requested_time: 60,
    total_people: 2,
    returned_people: 2,
    sample_rate: 1,
    locations: [
      {
        type: 'places',
        id: 'p1',
        people: [
          { id: 'a', infected: false, newly_infected: false },
          { id: 'b', infected: true, newly_infected: true }
        ]
      }
    ]
  };

  const first = makePersonStatusDotGeoJSON(pois, peopleMap);
  const second = makePersonStatusDotGeoJSON(pois, peopleMap);

  assert.deepEqual(first, second);
  assert.equal(first.features.length, 2);
  assert.equal(first.features[1].properties.person_id, 'b');
  assert.equal(first.features[1].properties.infected, true);
  assert.equal(first.features[1].properties.newly_infected, true);
  for (const feature of first.features) {
    const [lng, lat] = feature.geometry.coordinates;
    assert.equal(pointInGeometry(lng, lat, square), true);
  }
});

test('updateIcons coerces cached coordinate strings and formats hotspot text', () => {
  resetModelMapLayoutCaches();

  const icons = updateIcons(
    [0.5, 0.5],
    {
      h: [4, 1],
      p: [9, 3]
    },
    {
      homes: [
        {
          id: 'h1',
          cbg: '12345678901',
          latitude: '0.5',
          longitude: '0.5'
        }
      ],
      places: [
        {
          id: 'p1',
          latitude: '0.25',
          longitude: '0.25',
          label: 'Clinic',
          top_category: 'Offices of Physicians',
          footprint: square
        }
      ]
    },
    { p1: [60, 180] },
    {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { GEOID: '012345678901' },
          geometry: square
        }
      ]
    }
  );

  assert.equal(icons.length, 2);
  assert.equal(icons[0].label, 'Home #h1');
  assert.equal(icons[0].icon, '🏠');
  assert.equal(icons[1].label, 'Clinic');
  assert.equal(icons[1].icon, '🏥');
  assert.match(icons[1].description, /Hotspot at hours: 1, 3/);
});

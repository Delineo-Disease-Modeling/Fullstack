import assert from 'node:assert/strict';
import test from 'node:test';
import {
  makePeopleDotGeoJSON,
  makePersonStatusDotGeoJSON,
  makePoiFootprintGeoJSON,
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

// A diamond (rotated square) is the unit L1 ball — its edges run diagonally
// up AND down, which is exactly what the old `Math.max(latJ - latI, 1e-12)`
// ray-cast got wrong. An axis-aligned square hides the bug (its vertical edges
// have a zero numerator), so test the diamond against an exact oracle.
const diamond = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
      [0, 1]
    ]
  ]
};

test('pointInGeometry classifies a polygon with downward edges correctly (sign-bug regression)', () => {
  const oracle = (x, y) => Math.abs(x) + Math.abs(y) < 1;
  let checked = 0;
  let mismatches = 0;
  for (let gx = -9; gx <= 9; gx += 1) {
    for (let gy = -9; gy <= 9; gy += 1) {
      const x = gx / 10;
      const y = gy / 10;
      // Skip points sitting exactly on an edge (boundary is ambiguous).
      if (Math.abs(Math.abs(x) + Math.abs(y) - 1) < 1e-9) continue;
      checked += 1;
      if (pointInGeometry(x, y, diamond) !== oracle(x, y)) mismatches += 1;
    }
  }
  assert.ok(checked > 0);
  assert.equal(mismatches, 0);
});

test('samplePointsInFootprint keeps every dot inside a diagonally-edged polygon', () => {
  const points = samplePointsInFootprint(diamond, 40, 7);
  assert.equal(points.length, 40);
  for (const [lng, lat] of points) {
    assert.equal(pointInGeometry(lng, lat, diamond), true);
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
  assert.equal(data.features[0].properties.disabled, false);
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
  assert.equal(first.features[1].properties.disabled, false);
  for (const feature of first.features) {
    const [lng, lat] = feature.geometry.coordinates;
    assert.equal(pointInGeometry(lng, lat, square), true);
  }
});

test('makePersonStatusDotGeoJSON clamps dots inside a sparse footprint (never spills)', () => {
  resetModelMapLayoutCaches();
  // A thin diagonal sliver: its area is <1% of its bounding box, so rejection
  // sampling can't place all `count` points and the shortfall path engages.
  // Those leftover dots must cycle interior points, not spill into a disk.
  const sliver = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 10],
        [9.97, 10],
        [-0.03, 0],
        [0, 0]
      ]
    ]
  };
  const people = Array.from({ length: 60 }, (_, k) => ({
    id: `p${k}`,
    infected: false,
    newly_infected: false,
    recovered: false
  }));
  const result = makePersonStatusDotGeoJSON(
    [
      {
        type: 'places',
        id: 's1',
        latitude: 5,
        longitude: 5,
        label: 'Sliver',
        footprint: sliver,
        icon: '🏥',
        population: 60,
        infected: 0
      }
    ],
    {
      time: 0,
      requested_time: 0,
      total_people: 60,
      returned_people: 60,
      sample_rate: 1,
      locations: [{ type: 'places', id: 's1', people }]
    }
  );

  assert.equal(result.features.length, 60);
  for (const feature of result.features) {
    const [lng, lat] = feature.geometry.coordinates;
    assert.equal(pointInGeometry(lng, lat, sliver), true);
  }
});

test('makePeopleDotGeoJSON suppresses dots at disabled POIs', () => {
  resetModelMapLayoutCaches();

  const data = makePeopleDotGeoJSON(
    [
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
        infected: 2,
        disabled: true
      }
    ],
    'population'
  );

  // A disabled POI renders as an empty black marker, never as people dots.
  assert.equal(data.features.length, 0);
});

test('makePersonStatusDotGeoJSON suppresses dots at disabled POIs', () => {
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
      infected: 2,
      disabled: true
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

  const result = makePersonStatusDotGeoJSON(pois, peopleMap);

  // Disabled POI: no person dots emitted (visitors were rerouted away).
  assert.equal(result.features.length, 0);
});

test('makePoiFootprintGeoJSON exposes only place footprints', () => {
  const footprints = makePoiFootprintGeoJSON([
    {
      type: 'homes',
      id: 'h1',
      latitude: 0.5,
      longitude: 0.5,
      label: 'Home #h1',
      description: '5 people\n1 infected',
      footprint: square,
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
    },
    {
      type: 'places',
      id: 'p2',
      latitude: 0.25,
      longitude: 0.25,
      label: 'Office',
      description: '0 people\n0 infected',
      footprint: null,
      icon: '🏢',
      population: 0,
      infected: 0
    }
  ]);

  assert.equal(footprints.features.length, 1);
  assert.equal(footprints.features[0].properties.id, 'p1');
  assert.equal(footprints.features[0].properties.label, 'Clinic');
  assert.equal(footprints.features[0].properties.infection_ratio, 2 / 3);
  assert.deepEqual(footprints.features[0].geometry, square);
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

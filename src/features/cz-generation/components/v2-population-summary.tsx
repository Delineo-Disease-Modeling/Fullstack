import type { V2CensusPreparation } from '@/features/cz-generation/types';

export function V2PopulationSummary({ data }: { data: V2CensusPreparation }) {
  const blocks = Object.values(data.census.block_groups);
  const sum = (value: (block: (typeof blocks)[number]) => number | null) => {
    const values = blocks
      .map(value)
      .filter((value): value is number => value != null);
    return {
      total: values.reduce((total, value) => total + value, 0),
      available: values.length,
      selected: blocks.length
    };
  };
  const combine = (...values: (number | null)[]) =>
    values.some((value) => value == null)
      ? null
      : values.reduce<number>((total, value) => total + (value as number), 0);
  const missing = new Map<
    string,
    {
      field: string;
      variable: string | null;
      reason: string;
      locations: Set<string>;
    }
  >();
  for (const item of data.census.missing_fields) {
    const key = `${item.field}:${item.reason}`;
    const group = missing.get(key) ?? {
      field: item.field,
      variable: item.census_variable,
      reason: item.reason,
      locations: new Set<string>()
    };
    group.locations.add(item.cbg ? `CBG ${item.cbg}` : `County ${item.county}`);
    missing.set(key, group);
  }
  const ageCount = (min: number, max: number) =>
    sum((block) =>
      block.sex_age.reduce(
        (total, bucket) =>
          total +
          (bucket.min_age >= min && bucket.max_age <= max ? bucket.count : 0),
        0
      )
    );
  const groups: {
    category: string;
    rows: [string, ReturnType<typeof sum>][];
  }[] = [
    {
      category: 'Population',
      rows: [
        ['Total residents', sum((block) => block.population)],
        ['Children under 18', ageCount(0, 17)],
        ['Adults 18–64', ageCount(18, 64)],
        ['Adults 65+', ageCount(65, Infinity)]
      ]
    },
    {
      category: 'Households',
      rows: [
        ['Households', sum((block) => block.households.total_households)],
        [
          'Residents in households',
          sum((block) => block.residence.household_population)
        ]
      ]
    },
    {
      category: 'Group quarters',
      rows: [
        [
          'Residents in group quarters',
          sum((block) => block.residence.group_quarters_population)
        ]
      ]
    },
    {
      category: 'Employment',
      rows: [
        [
          'Civilian employed',
          sum((block) => block.employment.civilian_employed)
        ],
        ['Unemployed', sum((block) => block.employment.unemployed)],
        [
          'Outside the labor force',
          sum((block) => block.employment.not_in_labor_force)
        ],
        ['Armed forces', sum((block) => block.employment.armed_forces)]
      ]
    },
    {
      category: 'Education',
      rows: [
        [
          'Preschool and kindergarten',
          sum((block) =>
            combine(block.enrollment.preschool, block.enrollment.kindergarten)
          )
        ],
        [
          'Grades 1–12',
          sum((block) =>
            combine(
              block.enrollment.grades_1_to_4,
              block.enrollment.grades_5_to_8,
              block.enrollment.grades_9_to_12
            )
          )
        ],
        [
          'Undergraduate and graduate',
          sum((block) =>
            combine(
              block.enrollment.undergraduate,
              block.enrollment.graduate_or_professional
            )
          )
        ]
      ]
    },
    {
      category: 'Commuting',
      rows: [
        ['Workers', sum((block) => block.commuting.workers)],
        ['Working from home', sum((block) => block.commuting.worked_from_home)]
      ]
    }
  ];

  return (
    <section
      className="v2-region-summary"
      aria-labelledby="v2-population-heading"
    >
      <h3 id="v2-population-heading" className="v2-region-heading">
        Population inputs
      </h3>
      <p className="text-sm">
        {data.summary.cbg_count} block groups across {data.summary.county_count}{' '}
        {data.summary.county_count === 1 ? 'county' : 'counties'}
      </p>
      <table className="v2-population-table">
        <caption className="sr-only">
          Population inputs for the confirmed region
        </caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Measure</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        {groups.map(({ category, rows }) => (
          <tbody key={category}>
            {rows.map(([label, value], index) => (
              <tr key={label}>
                {index === 0 && (
                  <th scope="rowgroup" rowSpan={rows.length}>
                    {category}
                  </th>
                )}
                <th scope="row">{label}</th>
                <td>
                  {value.available === 0
                    ? 'Unavailable'
                    : value.total.toLocaleString()}
                  {value.available > 0 && value.available < value.selected && (
                    <>
                      <span> (partial)</span>
                      <small className="v2-population-availability">
                        Available for {value.available} of {value.selected}{' '}
                        block groups
                      </small>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      {missing.size > 0 && (
        <details className="v2-population-sources">
          <summary>Missing data ({missing.size} fields)</summary>
          {Array.from(missing, ([key, group]) => (
            <p key={key}>
              <strong>{group.field}</strong>
              {group.variable ? ` (${group.variable})` : ' (derived)'}:{' '}
              {group.reason === 'suppressed' ? 'Suppressed' : 'Unavailable'}.
              <br />
              {Array.from(group.locations).join(', ')}
            </p>
          ))}
        </details>
      )}
      <details className="v2-population-sources">
        <summary>Data sources and details</summary>
        <p>
          ACS {data.census.sources.year} five-year estimates for the confirmed
          block groups.
        </p>
        <p>
          Tables:{' '}
          {data.census.sources.tables
            .filter(
              (table) =>
                !data.census.sources.county_distribution_tables.includes(table)
            )
            .join(', ')}
          .
        </p>
        <p>
          County age/sex distributions for later employment and enrollment
          assignment:{' '}
          {data.census.sources.county_distribution_tables.join(', ')}. These
          county counts are excluded from the summary above.
        </p>
      </details>
    </section>
  );
}

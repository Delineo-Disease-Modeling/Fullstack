export type ParsedRouteNumber =
  | { ok: true; value: number }
  | { ok: false; message: string; status: 400 };

type NumberParamOptions = {
  finite?: boolean;
  minimum?: number;
  exclusiveMinimum?: boolean;
};

export function parseRouteNumberParam(
  rawValue: string,
  paramName: string,
  options: NumberParamOptions = {}
): ParsedRouteNumber {
  const value = Number(rawValue);
  const minimum = options.minimum ?? 0;

  const belowMinimum = options.exclusiveMinimum
    ? value <= minimum
    : value < minimum;
  const invalid =
    Number.isNaN(value) ||
    (options.finite === true && !Number.isFinite(value)) ||
    belowMinimum;

  if (invalid) {
    return { ok: false, message: `Invalid ${paramName}`, status: 400 };
  }

  return { ok: true, value };
}

export function parseNonNegativeRouteNumber(
  rawValue: string,
  paramName: string
): ParsedRouteNumber {
  return parseRouteNumberParam(rawValue, paramName);
}

export function parsePositiveFiniteRouteNumber(
  rawValue: string,
  paramName: string
): ParsedRouteNumber {
  return parseRouteNumberParam(rawValue, paramName, {
    finite: true,
    minimum: 0,
    exclusiveMinimum: true
  });
}

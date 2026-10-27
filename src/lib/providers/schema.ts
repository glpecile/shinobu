import * as Option from 'effect/Option';
import * as Predicate from 'effect/Predicate';
import * as Schema from 'effect/Schema';
import * as SchemaGetter from 'effect/SchemaGetter';

/** Provider metadata may be omitted or null; normalize both to an optional field. */
export function optionalNullable<S extends Schema.Constraint>(schema: S) {
  return Schema.optional(Schema.NullOr(schema)).pipe(
    Schema.decodeTo(Schema.optional(Schema.toType(schema)), {
      decode: SchemaGetter.transformOptional(Option.filter(Predicate.isNotNull)),
      encode: SchemaGetter.passthrough(),
    }),
  );
}

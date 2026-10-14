-- A Brand Kit can publish several approved logo roles while preserving the
-- existing wordmark/monogram requirement and immutable decision references.
alter table public.studio_review_rounds
  drop constraint if exists studio_review_rounds_scope_check;

alter table public.studio_review_rounds
  add constraint studio_review_rounds_scope_check check (
    scope in (
      'name',
      'wordmark',
      'monogram',
      'logo_horizontal',
      'logo_stacked',
      'logo_reverse',
      'logo_one_color',
      'logo_embroidery',
      'palette',
      'typography',
      'guidelines',
      'concept'
    )
  );

alter table public.studio_kits
  drop constraint if exists studio_kits_creative_components_only;

alter table public.studio_kits
  add constraint studio_kits_creative_components_only check (
    jsonb_typeof(components) = 'object'
    and components - array[
      'name',
      'wordmark',
      'monogram',
      'logo_horizontal',
      'logo_stacked',
      'logo_reverse',
      'logo_one_color',
      'logo_embroidery',
      'palette',
      'typography',
      'guidelines',
      'concept'
    ] = '{}'::jsonb
  );

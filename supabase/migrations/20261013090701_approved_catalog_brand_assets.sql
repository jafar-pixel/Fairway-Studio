alter table public.studio_sample_catalog drop constraint studio_sample_catalog_origin_check;
alter table public.studio_sample_catalog add constraint studio_sample_catalog_origin_check check(origin in ('ai_sample_render','logo_design_proposal','approved_brand_asset'));
update public.studio_sample_catalog set origin='approved_brand_asset' where sample_key in ('hunter-heckard-approved-logo','hunter-heckard-transparent-logo');

# O*NET 31.0 subset

O*NET 31.0 Database by U.S. Department of Labor, Employment and Training
Administration (USDOL/ETA), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Source: [O*NET 31.0 CSV database](https://www.onetcenter.org/dl_files/database/db_31_0_csv.zip),
released August 2026. [O*NET database information](https://www.onetcenter.org/database.html).

Changes: selected columns and files have been converted to compact JSON arrays;
ratings retain IM/LV for essential skills, transferable skills and knowledge,
and DR for work styles. Occupation/DWA pairs are deduplicated. Numeric values
are parsed as numbers and Y/N flags become booleans (blank flags become false;
work styles have no suppression or not-relevant columns and use false).
Original descriptions, titles, examples and rating values are retained.
This derivative is not endorsed by USDOL/ETA.

`meta.files` records input data-row counts, excluding headers, before filtering
or deduplication. Arrays preserve source order; the gzip uses compression level 9.

To regenerate locally, download and extract the source ZIP, then from `backend/`:

```sh
npm run onet:extract -- --dir <extracted CSV directory> --out data/onet/31.0/onet-subset.json.gz
```

The extractor uses local files only; the application server does not download O*NET.

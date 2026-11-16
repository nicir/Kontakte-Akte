# Map data

The world map uses the TopoJSON file `countries-50m.json` from the npm package
[`world-atlas`](https://github.com/topojson/world-atlas) (ISC licence), derived from
[Natural Earth](https://www.naturalearthdata.com/) 1:50m Admin 0 – Countries (public domain).

It is imported in `desktop/src/features/map/WorldMap.tsx` and bundled into the app at build
time; no map tiles or network requests are used at runtime. Countries are matched by ISO 3166-1
numeric code (`countries.numeric` in the database).

Country names (German/English, ISO 3166-1 alpha-2/numeric) are in
`backend/app/data/countries.json`, generated once from the ISO data shipped with `pycountry`
(with a few colloquial German names, e.g. "Russland").

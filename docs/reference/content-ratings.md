# Age ratings and the minimum age behind each label

The minimum age KROMA gives every age-rating label the metadata provider returns. The
server stores it beside each label it keeps for a title, and a profile's maturity ceiling
compares it ([`docs/spec/accounts/kids.md`](../spec/accounts/kids.md), ACCT-102). Read
2026-11-21.

## Sources

- **T**: TMDB's own lists of the labels it returns, per country, with what each one means:
  [`/certification/movie/list`](https://developer.themoviedb.org/reference/certification-movie-list)
  (52 countries) and [`/certification/tv/list`](https://developer.themoviedb.org/reference/certifications-tv-list)
  (49 countries), fetched 2026-11-21. Every label below is in one of them, and every label in
  them is below.
- **W**: Wikipedia, [Motion picture content rating system](https://en.wikipedia.org/wiki/Motion_picture_content_rating_system),
  read 2026-11-21, one section per country. Used where TMDB gives no meaning (Hong Kong,
  Macau, Puerto Rico, Singapore on television, Sweden on television).
- **N**: Netflix, [Maturity ratings for TV shows and movies](https://help.netflix.com/en/node/2064),
  for the six levels a ceiling is chosen from: All, 7+, 10+, 13+, 16+, 18+.

## How a label gets its age

1. A label the system ties to an age takes that age: the youngest viewer the system calls
   it suitable for, or admits without an adult. `PG-13` is 13, `12A` is 12, `MA 15+` is 15,
   `R` in the United States is 17 (under 17 only with an adult), `NC-17` is 18.
2. A label for every age is 0: `G`, `U`, `TP`, `0`, `AL`, `ATP`, `TV-Y`, `TV-G`.
3. A label made for children and named for their age band takes the band's lowest age that
   the system says is suitable: `TV-Y7` is 7, `C8` is 8. A band that starts below school
   age is 0.
4. A parental-guidance label whose system names no age takes 10, the age the US system
   gives its own `PG` ("may not be suitable for children under 10", source T). These rows
   carry a `*`. Where the system names an age, that age wins: `PG` is 8 in Britain and
   Ireland, 13 in the Philippines.
5. A label that is not a rating (not rated, exempt, unrated) has no age, and the title
   counts as unrated in that country. Three systems use `Unrated` or `NR` to mean "every
   age" (Bulgaria, Hungary and Romania on television, Morocco), and there it is 0, as T
   says.
6. A refused, banned or pornographic classification is 18, or the system's adult age when
   it is higher (20 in Thailand).
7. Four labels the rules above leave open take an age KROMA chose, and carry a `*`. Hong
   Kong's `IIA`, "not suitable for children", is 12, and `IIB`, "not suitable for young
   persons and children", is 15 (source W). Romania's `AP` means "general audience" for a
   film and "with parental guidance" for a show (source T); it is 0, its film meaning. The
   Philippines' `SPG` asks for stronger guidance than its `PG`, which is 13, so it is 13.

A ceiling compares ages, so an age above 18 (Korea's 19, Thailand's 20, Singapore's and
Indonesia's 21) passes only the 18+ level, which hides nothing.

## The table

`*` marks an age KROMA chose because the system names none (rules 4 and 7).

| Country | Label | Used for | Minimum age |
|---|---|---|---|
| AR | `ATP` | film, show | 0 |
| AR | `+13` | film | 13 |
| AR | `+16` | film | 16 |
| AR | `+18` | film | 18 |
| AR | `C` | film | 18 |
| AR | `SAM 13` | show | 13 |
| AR | `SAM 16` | show | 16 |
| AR | `SAM 18` | show | 18 |
| AT | `AA` | film, show | 0 |
| AT | `6` | film, show | 6 |
| AT | `8` | film, show | 8 |
| AT | `10` | film, show | 10 |
| AT | `12` | film, show | 12 |
| AT | `14` | film, show | 14 |
| AT | `16` | film, show | 16 |
| AU | `P` | show | 0 |
| AU | `C` | show | 5 |
| AU | `G` | film, show | 0 |
| AU | `PG` | film, show | 10 * |
| AU | `M` | film, show | 15 |
| AU | `MA 15+` | film, show | 15 |
| AU | `R 18+` | film, show | 18 |
| AU | `X 18+` | film | 18 |
| AU | `RC` | film | 18 |
| BE | `AL` | film, show | 0 |
| BE | `6` | film, show | 6 |
| BE | `9` | film, show | 9 |
| BE | `12` | film, show | 12 |
| BE | `14` | film, show | 14 |
| BE | `16` | film, show | 16 |
| BE | `18` | film, show | 18 |
| BG | `A` | film | 0 |
| BG | `B` | film | 0 |
| BG | `C` | film | 12 |
| BG | `D` | film | 16 |
| BG | `X` | film | 18 |
| BG | `Unrated` | show | 0 |
| BG | `12` | show | 12 |
| BG | `14` | show | 14 |
| BG | `16` | show | 16 |
| BG | `18` | show | 18 |
| BR | `L` | film, show | 0 |
| BR | `10` | film, show | 10 |
| BR | `12` | film, show | 12 |
| BR | `14` | film, show | 14 |
| BR | `16` | film, show | 16 |
| BR | `18` | film, show | 18 |
| CA | `E` | film | unrated |
| CA | `Exempt` | show | unrated |
| CA | `C` | show | 0 |
| CA | `C8` | show | 8 |
| CA | `G` | film, show | 0 |
| CA | `PG` | film, show | 10 * |
| CA | `14A` | film | 14 |
| CA | `14+` | show | 14 |
| CA | `18A` | film | 18 |
| CA | `18+` | show | 18 |
| CA | `R` | film | 18 |
| CA | `A` | film | 18 |
| CA-QC | `NR` | film, show | unrated |
| CA-QC | `G` | film, show | 0 |
| CA-QC | `8+` | show | 8 |
| CA-QC | `13+` | film, show | 13 |
| CA-QC | `16+` | film, show | 16 |
| CA-QC | `18+` | film, show | 18 |
| CH | `0` | film, show | 0 |
| CH | `6` | film, show | 6 |
| CH | `8` | film | 8 |
| CH | `10` | film | 10 |
| CH | `12` | film, show | 12 |
| CH | `14` | film | 14 |
| CH | `16` | film, show | 16 |
| CH | `18` | film, show | 18 |
| CL | `UR` | film | unrated |
| CL | `TE` | film | 0 |
| CL | `TE+7` | film | 7 |
| CL | `14` | film | 14 |
| CL | `18` | film | 18 |
| CL | `I` | show | 0 |
| CL | `I7` | show | 7 |
| CL | `I10` | show | 10 |
| CL | `I12` | show | 12 |
| CL | `F` | show | 0 |
| CL | `R` | show | 12 |
| CL | `A` | show | 18 |
| CZ | `UR` | film | unrated |
| CZ | `U` | film | 0 |
| CZ | `0+` | show | 0 |
| CZ | `5+` | show | 5 |
| CZ | `7+` | show | 7 |
| CZ | `9+` | show | 9 |
| CZ | `12+` | film, show | 12 |
| CZ | `15+` | film, show | 15 |
| CZ | `18+` | film, show | 18 |
| DE | `0` | film, show | 0 |
| DE | `6` | film, show | 6 |
| DE | `12` | film, show | 12 |
| DE | `16` | film, show | 16 |
| DE | `18` | film, show | 18 |
| DK | `NR` | film | unrated |
| DK | `A` | film, show | 0 |
| DK | `7` | film, show | 7 |
| DK | `11` | film, show | 11 |
| DK | `15` | film, show | 15 |
| DK | `F` | film | unrated |
| ES | `NR` | show | unrated |
| ES | `A` | film | 0 |
| ES | `Ai` | film | 0 |
| ES | `ERI` | show | 0 |
| ES | `TP` | show | 0 |
| ES | `7` | film, show | 7 |
| ES | `7i` | film | 7 |
| ES | `10` | show | 10 |
| ES | `12` | film, show | 12 |
| ES | `13` | show | 13 |
| ES | `16` | film, show | 16 |
| ES | `18` | film, show | 18 |
| ES | `X` | film | 18 |
| FI | `S` | film, show | 0 |
| FI | `K-7` | film | 7 |
| FI | `K-12` | film | 12 |
| FI | `K-16` | film | 16 |
| FI | `K-18` | film | 18 |
| FI | `KK` | film | 18 |
| FI | `K7` | show | 7 |
| FI | `K12` | show | 12 |
| FI | `K16` | show | 16 |
| FI | `K18` | show | 18 |
| FR | `NR` | film, show | unrated |
| FR | `TP` | film, show | 0 |
| FR | `10` | show | 10 |
| FR | `12` | film, show | 12 |
| FR | `16` | film, show | 16 |
| FR | `18` | film, show | 18 |
| GB | `U` | film, show | 0 |
| GB | `PG` | film, show | 8 |
| GB | `12A` | film, show | 12 |
| GB | `12` | film, show | 12 |
| GB | `15` | film, show | 15 |
| GB | `18` | film, show | 18 |
| GB | `R18` | film, show | 18 |
| GR | `K` | film, show | 0 |
| GR | `K12` | film | 12 |
| GR | `K15` | film | 15 |
| GR | `K18` | film | 18 |
| GR | `8` | show | 8 |
| GR | `12` | show | 12 |
| GR | `16` | show | 16 |
| GR | `18` | show | 18 |
| HK | `I` | film | 0 |
| HK | `IIA` | film | 12 * |
| HK | `IIB` | film | 15 * |
| HK | `III` | film | 18 |
| HU | `NR` | film, show | unrated |
| HU | `KN` | film | 0 |
| HU | `Unrated` | show | 0 |
| HU | `Children` | show | 0 |
| HU | `6` | film, show | 6 |
| HU | `12` | film, show | 12 |
| HU | `16` | film, show | 16 |
| HU | `18` | film, show | 18 |
| HU | `X` | film | 18 |
| ID | `SU` | film, show | 0 |
| ID | `13+` | film | 13 |
| ID | `17+` | film | 17 |
| ID | `21+` | film | 21 |
| ID | `P` | show | 0 |
| ID | `A` | show | 7 |
| ID | `R` | show | 13 |
| ID | `D` | show | 18 |
| IE | `G` | film, show | 0 |
| IE | `PG` | film, show | 8 |
| IE | `12A` | film | 12 |
| IE | `12` | film, show | 12 |
| IE | `15A` | film | 15 |
| IE | `15` | film, show | 15 |
| IE | `16` | film, show | 16 |
| IE | `18` | film, show | 18 |
| IL | `All` | film | 0 |
| IL | `E` | show | unrated |
| IL | `G` | show | 0 |
| IL | `12` | film | 12 |
| IL | `12+` | show | 12 |
| IL | `14` | film | 14 |
| IL | `15+` | show | 15 |
| IL | `16` | film | 16 |
| IL | `18` | film | 18 |
| IL | `18+` | show | 18 |
| IN | `U` | film, show | 0 |
| IN | `U/A 7+` | film, show | 7 |
| IN | `UA` | film | 12 |
| IN | `U/A 13+` | film, show | 13 |
| IN | `U/A 16+` | film, show | 16 |
| IN | `A` | film, show | 18 |
| IN | `S` | film | 18 |
| IT | `NR` | film | unrated |
| IT | `T` | film, show | 0 |
| IT | `6+` | film | 6 |
| IT | `10+` | film | 10 |
| IT | `14+` | film | 14 |
| IT | `18+` | film | 18 |
| IT | `BA` | show | 10 * |
| IT | `VM12` | show | 12 |
| IT | `VM14` | show | 14 |
| IT | `VM18` | show | 18 |
| JP | `G` | film | 0 |
| JP | `PG12` | film | 12 |
| JP | `R15+` | film | 15 |
| JP | `R18+` | film | 18 |
| KR | `Exempt` | show | unrated |
| KR | `ALL` | film, show | 0 |
| KR | `7` | show | 7 |
| KR | `12` | film, show | 12 |
| KR | `15` | film, show | 15 |
| KR | `19` | film, show | 19 |
| KR | `Restricted Screening` | film | 19 |
| LT | `NR` | film, show | unrated |
| LT | `V` | film | 0 |
| LT | `N-7` | film, show | 7 |
| LT | `N-13` | film | 13 |
| LT | `N-14` | show | 14 |
| LT | `N-16` | film | 16 |
| LT | `N-18` | film | 18 |
| LT | `S` | show | 18 |
| LU | `A` | film | 0 |
| LU | `Tous` | show | 0 |
| LU | `6` | film | 6 |
| LU | `10` | show | 10 |
| LU | `12` | film, show | 12 |
| LU | `16` | film, show | 16 |
| LU | `18` | film, show | 18 |
| LV | `U` | film | 0 |
| LV | `7+` | film | 7 |
| LV | `12+` | film | 12 |
| LV | `16+` | film | 16 |
| LV | `18+` | film | 18 |
| MA | `NR` | show | 0 |
| MA | `10` | show | 10 |
| MA | `12` | show | 12 |
| MA | `16` | show | 16 |
| MO | `A` | film | 0 |
| MO | `B` | film | 13 |
| MO | `C` | film | 18 |
| MO | `D` | film | 18 |
| MX | `AA` | film, show | 0 |
| MX | `A` | film, show | 0 |
| MX | `B` | film, show | 12 |
| MX | `B-15` | film, show | 15 |
| MX | `C` | film, show | 18 |
| MX | `D` | film, show | 18 |
| MY | `NR` | film | unrated |
| MY | `U` | film, show | 0 |
| MY | `P13` | film, show | 13 |
| MY | `18` | show | 18 |
| MY | `18SG` | film | 18 |
| MY | `18SX` | film | 18 |
| MY | `18PA` | film | 18 |
| MY | `18PL` | film | 18 |
| NL | `NR` | show | unrated |
| NL | `AL` | film, show | 0 |
| NL | `6` | film, show | 6 |
| NL | `9` | film, show | 9 |
| NL | `12` | film, show | 12 |
| NL | `14` | film, show | 14 |
| NL | `16` | film, show | 16 |
| NL | `18` | film, show | 18 |
| NO | `NR` | film | unrated |
| NO | `A` | film, show | 0 |
| NO | `6` | film, show | 6 |
| NO | `9` | film, show | 9 |
| NO | `12` | film, show | 12 |
| NO | `15` | film, show | 15 |
| NO | `18` | film, show | 18 |
| NZ | `G` | film, show | 0 |
| NZ | `PG` | film, show | 10 * |
| NZ | `M` | film, show | 16 |
| NZ | `R13` | film | 13 |
| NZ | `RP13` | film | 13 |
| NZ | `R15` | film | 15 |
| NZ | `R16` | film | 16 |
| NZ | `RP16` | film | 16 |
| NZ | `R18` | film | 18 |
| NZ | `RP18` | film | 18 |
| NZ | `R` | film | 18 |
| NZ | `16` | show | 16 |
| NZ | `18` | show | 18 |
| PH | `NR` | film, show | unrated |
| PH | `G` | film, show | 0 |
| PH | `PG` | film, show | 13 |
| PH | `R-13` | film | 13 |
| PH | `R-16` | film | 16 |
| PH | `R-18` | film | 18 |
| PH | `X` | film, show | 18 |
| PH | `SPG` | show | 13 * |
| PL | `AL` | film, show | 0 |
| PL | `0` | show | 0 |
| PL | `7` | film, show | 7 |
| PL | `12` | film, show | 12 |
| PL | `16` | film, show | 16 |
| PL | `18` | film, show | 18 |
| PR | `NR` | film, show | unrated |
| PR | `G` | film | 0 |
| PR | `PG` | film | 10 * |
| PR | `PG-13` | film | 13 |
| PR | `R` | film | 17 |
| PR | `NC-17` | film | 18 |
| PR | `TV-Y` | show | 0 |
| PR | `TV-Y7` | show | 7 |
| PR | `TV-G` | show | 0 |
| PR | `TV-PG` | show | 10 * |
| PR | `TV-14` | show | 14 |
| PR | `TV-MA` | show | 17 |
| PT | `NR` | show | unrated |
| PT | `Públicos` | film | 0 |
| PT | `T` | show | 0 |
| PT | `M/3` | film | 3 |
| PT | `M/6` | film | 6 |
| PT | `10` | show | 10 |
| PT | `M/12` | film | 12 |
| PT | `12` | show | 12 |
| PT | `M/14` | film | 14 |
| PT | `M/16` | film | 16 |
| PT | `16` | show | 16 |
| PT | `M/18` | film | 18 |
| PT | `P` | film | 18 |
| RO | `Unrated` | show | 0 |
| RO | `AP` | film, show | 0 * |
| RO | `12` | film, show | 12 |
| RO | `15` | film, show | 15 |
| RO | `18` | film, show | 18 |
| RO | `18+` | film | 18 |
| RO | `IC` | film | 18 |
| RU | `NR` | film | unrated |
| RU | `0+` | film, show | 0 |
| RU | `6+` | film, show | 6 |
| RU | `12+` | film, show | 12 |
| RU | `16+` | film, show | 16 |
| RU | `18+` | film, show | 18 |
| SE | `NR` | film | unrated |
| SE | `Btl` | film, show | 0 |
| SE | `7` | film | 7 |
| SE | `11` | film | 11 |
| SE | `15` | film | 15 |
| SE | `Från 7 år` | show | 7 |
| SE | `Från 11 år` | show | 11 |
| SE | `Från 15 år` | show | 15 |
| SG | `G` | film, show | 0 |
| SG | `PG` | film, show | 10 * |
| SG | `PG13` | film, show | 13 |
| SG | `NC16` | film, show | 16 |
| SG | `M18` | film, show | 18 |
| SG | `R21` | film, show | 21 |
| SK | `NR` | show | unrated |
| SK | `U` | film, show | 0 |
| SK | `7` | film, show | 7 |
| SK | `12` | film, show | 12 |
| SK | `15` | film, show | 15 |
| SK | `18` | film, show | 18 |
| TH | `P` | film | 0 |
| TH | `G` | film | 0 |
| TH | `13` | film | 13 |
| TH | `15` | film | 15 |
| TH | `18` | film | 18 |
| TH | `20` | film | 20 |
| TH | `Banned` | film | 20 |
| TH | `ส` | show | 0 |
| TH | `ท` | show | 0 |
| TH | `น 13+` | show | 13 |
| TH | `น 15+` | show | 15 |
| TH | `น 18+` | show | 18 |
| TH | `ฉ 20-` | show | 20 |
| TH | `-` | show | 20 |
| TR | `Genel İzleyici Kitlesi` | film | 0 |
| TR | `Genel İzleyici` | show | 0 |
| TR | `6A` | film | 6 |
| TR | `6+` | film | 6 |
| TR | `7+` | show | 7 |
| TR | `10A` | film | 10 |
| TR | `10+` | film | 10 |
| TR | `13A` | film | 13 |
| TR | `13+` | film, show | 13 |
| TR | `16+` | film | 16 |
| TR | `18+` | film, show | 18 |
| TW | `0+` | film, show | 0 |
| TW | `6+` | film, show | 6 |
| TW | `12+` | film, show | 12 |
| TW | `15+` | film, show | 15 |
| TW | `18+` | film, show | 18 |
| UA | `UR` | show | unrated |
| UA | `0+` | film, show | 0 |
| UA | `9+` | show | 9 |
| UA | `12+` | film, show | 12 |
| UA | `16+` | film, show | 16 |
| UA | `18+` | film, show | 18 |
| US | `NR` | film, show | unrated |
| US | `G` | film | 0 |
| US | `PG` | film | 10 |
| US | `PG-13` | film | 13 |
| US | `R` | film | 17 |
| US | `NC-17` | film | 18 |
| US | `TV-Y` | show | 0 |
| US | `TV-Y7` | show | 7 |
| US | `TV-G` | show | 0 |
| US | `TV-PG` | show | 10 * |
| US | `TV-14` | show | 14 |
| US | `TV-MA` | show | 17 |
| VI | `NR` | film, show | unrated |
| VI | `G` | film | 0 |
| VI | `PG` | film | 10 * |
| VI | `PG-13` | film | 13 |
| VI | `R` | film | 17 |
| VI | `NC-17` | film | 18 |
| VI | `TV-Y` | show | 0 |
| VI | `TV-Y7` | show | 7 |
| VI | `TV-G` | show | 0 |
| VI | `TV-PG` | show | 10 * |
| VI | `TV-14` | show | 14 |
| VI | `TV-MA` | show | 17 |
| ZA | `A` | film | 0 |
| ZA | `All` | show | 0 |
| ZA | `PG` | film, show | 10 * |
| ZA | `7-9PG` | film | 7 |
| ZA | `10-12PG` | film | 10 |
| ZA | `13` | film, show | 13 |
| ZA | `16` | film, show | 16 |
| ZA | `18` | film, show | 18 |
| ZA | `X18` | film, show | 18 |
| ZA | `XX` | film | 18 |

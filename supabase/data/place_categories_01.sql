-- Kategorier (2026-11-10): nya underkategorier (Lägenhet & Stuga, Vandrarhem, Blommor & Trädgård), saknade underkategorier,
-- rättade kategorier, och inredningsbutikerna flyttade från Hantverk & Service › Inredning & Livsstil till Butiker › Hem & Inredning. 83 platser.
begin;
update public.places set categories = 'Butiker', sub_category = 'Livsmedel & Dagligvaror' where id = 4; -- Gunnarshögs Gård: Butiker, Hantverk & Service | Livsmedel & Dagligvaror
update public.places set categories = 'Hotell & B&B', sub_category = 'Hotell, Spa' where id = 17; -- Kåseberga Hotell: Hotell & B&B | Spa
update public.places set categories = 'Hotell & B&B', sub_category = 'Lägenhet & Stuga' where id = 20; -- Kåseberga Hideout: Hotell & B&B | -
update public.places set categories = 'Butiker, Hotell & B&B, Mat & Dryck', sub_category = 'Casual, Livsmedel & Dagligvaror, Hotell' where id = 28; -- Farmors Lycka: Butiker, Hotell & B&B, Mat & Dryck | Café, Livsmedel & Dagligvaror, Hotell
update public.places set categories = 'Hotell & B&B', sub_category = 'Hotell' where id = 47; -- Hvitaby Järnvägshotell: Hotell & B&B | B&B
update public.places set categories = 'Hotell & B&B', sub_category = 'Lägenhet & Stuga' where id = 51; -- Annagården Österlen: Hotell & B&B | -
update public.places set categories = 'Mat & Dryck, Café & Bageri, Hotell & B&B', sub_category = 'Pizza, Café, Glass, Trädgård, Hotell' where id = 95; -- Örum 119: Mat & Dryck, Café & Bageri | Pizza, Café, Glass, Trädgård
update public.places set categories = 'Café & Bageri, Mat & Dryck', sub_category = 'Café, Casual' where id = 96; -- Hannas House: Mat & Dryck | Café
update public.places set categories = 'Café & Bageri', sub_category = 'Bageri, Café' where id = 111; -- Byvägen 35: Café & Bageri | Bageri
update public.places set categories = 'Café & Bageri, Mat & Dryck', sub_category = 'Bageri, Café, Pizza' where id = 116; -- Sally på Kivik: Café & Bageri | Bageri, Café
update public.places set categories = 'Hantverk & Service, Mat & Dryck', sub_category = 'Gallerier, Casual' where id = 120; -- Rikstolvan: Sevärdheter, Hantverk & Service | Gallerier
update public.places set categories = 'Mat & Dryck, Hotell & B&B', sub_category = 'Pub & Bar, Vandrarhem' where id = 123; -- Bengtssons Loge: Mat & Dryck | Pub & Bar
update public.places set categories = 'Hotell & B&B', sub_category = 'B&B' where id = 126; -- Systrarna på Kivik: Hotell & B&B, Mat & Dryck | Casual, B&B
update public.places set categories = 'Mat & Dryck, Café & Bageri', sub_category = 'Casual, Café' where id = 144; -- Sandhammarens Fyrgrill: Mat & Dryck, Café & Bageri | Casual
update public.places set categories = 'Hantverk & Service', sub_category = 'Gallerier' where id = 172; -- Rockhead Art: Hantverk & Service | Ateljéer
update public.places set categories = 'Butiker', sub_category = 'Hem & Inredning' where id = 192; -- Borrby Bokby: Hantverk & Service | Verkstäder
update public.places set categories = 'Butiker', sub_category = 'Hem & Inredning' where id = 193; -- Karl Fredrik på Eklaholm: Hantverk & Service | Inredning & Livsstil
update public.places set categories = 'Butiker', sub_category = 'Hem & Inredning' where id = 196; -- Apotekarns: Hantverk & Service | Inredning & Livsstil
update public.places set categories = 'Butiker', sub_category = 'Hem & Inredning' where id = 209; -- Österlen Inredning: Hantverk & Service | Inredning & Livsstil
update public.places set categories = 'Butiker', sub_category = 'Hem & Inredning' where id = 210; -- Kringstad Interiör: Hantverk & Service | Inredning & Livsstil
update public.places set categories = 'Natur & Upplevelser', sub_category = 'Stränder, Vandring' where id = 216; -- Grönet: Sevärdheter | -
update public.places set categories = 'Natur & Upplevelser', sub_category = 'Stränder, Vandring' where id = 217; -- Simris strandängar: Sevärdheter | -
update public.places set categories = 'Natur & Upplevelser', sub_category = 'Utsikt' where id = 226; -- Lonely Tree Baskemölla: Sevärdheter | Utsikt
update public.places set categories = 'Hotell & B&B', sub_category = 'B&B' where id = 228; -- Ales BnB: Hotell & B&B | -
update public.places set categories = 'Mat & Dryck', sub_category = 'Casual, Pizza' where id = 231; -- Restaurang Cimbris: Mat & Dryck | -
update public.places set categories = 'Mat & Dryck', sub_category = 'Casual' where id = 236; -- Thai Garden Tomelilla: Mat & Dryck | -
update public.places set categories = 'Hotell & B&B', sub_category = 'Lägenhet & Stuga' where id = 239; -- Borrby Kungsgård: Hotell & B&B | -
update public.places set categories = 'Butiker', sub_category = 'Blommor & Trädgård, Hem & Inredning' where id = 243; -- Allevadstorp Trädgård & Interiör: Butiker | -
update public.places set categories = 'Butiker', sub_category = 'Hem & Inredning' where id = 244; -- Engberg Interior Design: Hantverk & Service | Inredning & Livsstil
update public.places set categories = 'Butiker', sub_category = 'Hem & Inredning' where id = 245; -- Jansro Hem & Trädgård: Hantverk & Service | Inredning & Livsstil
update public.places set categories = 'Butiker', sub_category = 'Hem & Inredning' where id = 246; -- Pellgaardska: Hantverk & Service | Inredning & Livsstil
update public.places set categories = 'Hotell & B&B', sub_category = 'Hotell' where id = 247; -- Drakamöllan Gårdshotell: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'Vandrarhem' where id = 248; -- Råkulle Vandrarhem: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'Lägenhet & Stuga' where id = 250; -- Gamla Prästgården i Rörum: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'Hotell' where id = 251; -- Rörums Gårdshotell: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'B&B' where id = 252; -- Hoby Gård Bed & Breakfast: Hotell & B&B | -
update public.places set categories = 'Butiker', sub_category = 'Blommor & Trädgård' where id = 253; -- Systrarna Lindskogs Trädgård & Design: Hantverk & Service | Inredning & Livsstil
update public.places set categories = 'Hotell & B&B', sub_category = 'Hotell' where id = 255; -- Hotel Kockska Gården: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'Hotell' where id = 256; -- Hotell Turistgården: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'Lägenhet & Stuga' where id = 257; -- Kastanjegården på Stenshuvud: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'Vandrarhem' where id = 260; -- Kuskahusen Vandrarhem: Hotell & B&B | -
update public.places set categories = 'Sevärdheter', sub_category = 'Museum' where id = 277; -- Sjöfartsmuseet Hoppet: Sevärdheter | -
update public.places set categories = 'Butiker', sub_category = 'Hem & Inredning, Blommor & Trädgård' where id = 279; -- En liten bit av Medelhavet: Butiker | -
update public.places set categories = 'Butiker, Mat & Dryck', sub_category = 'Livsmedel & Dagligvaror, Pub & Bar' where id = 281; -- Forse Cidergård: Butiker | -
update public.places set categories = 'Butiker', sub_category = 'Livsmedel & Dagligvaror' where id = 286; -- Sannas Italien: Butiker | -
update public.places set categories = 'Butiker', sub_category = 'Livsmedel & Dagligvaror' where id = 288; -- Häggs Livs: Butiker | -
update public.places set categories = 'Butiker', sub_category = 'Hem & Inredning, Kläder & Mode' where id = 289; -- Bo Ohlsson i Tomelilla: Butiker | -
update public.places set categories = 'Butiker', sub_category = 'Blommor & Trädgård' where id = 291; -- Trolldruvan Flower Cottage: Butiker | -
update public.places set categories = 'Butiker', sub_category = 'Livsmedel & Dagligvaror' where id = 292; -- Götes Allköp i Brösarp: Butiker | -
update public.places set categories = 'Butiker', sub_category = 'Blommor & Trädgård' where id = 293; -- MaKalösa Trädgårdar: Butiker | -
update public.places set categories = 'Butiker', sub_category = 'Hem & Inredning' where id = 294; -- Simrishamns Bokhandel: Butiker | -
update public.places set categories = 'Butiker', sub_category = 'Blommor & Trädgård' where id = 295; -- Ullstorps Gardencenter: Butiker | -
update public.places set categories = 'Butiker', sub_category = 'Hem & Inredning' where id = 297; -- Studio Billa: Butiker | -
update public.places set categories = 'Butiker', sub_category = 'Livsmedel & Dagligvaror' where id = 299; -- Lavelunds Gårdsbutik: Butiker | -
update public.places set categories = 'Butiker', sub_category = 'Livsmedel & Dagligvaror' where id = 302; -- Hemdala Gårdsbutik: Butiker | -
update public.places set categories = 'Butiker', sub_category = 'Blommor & Trädgård' where id = 303; -- I vått och torrt: Butiker | -
update public.places set categories = 'Butiker, Hotell & B&B', sub_category = 'Hem & Inredning' where id = 305; -- Blästorps Gård: Butiker, Hotell & B&B | -
update public.places set categories = 'Mat & Dryck', sub_category = 'Casual' where id = 308; -- Smoked by Joe: Mat & Dryck | -
update public.places set categories = 'Hantverk & Service', sub_category = 'Gallerier' where id = 310; -- Kabusa Art Gallery: Hantverk & Service | -
update public.places set categories = 'Mat & Dryck', sub_category = 'Casual, Pub & Bar' where id = 315; -- Köpmangatan 6: Mat & Dryck | -
update public.places set categories = 'Aktiviteter', sub_category = 'Sport' where id = 320; -- Österlen Surfcenter: Butiker | Sport & Fritid
update public.places set categories = 'Aktiviteter', sub_category = 'Sport' where id = 322; -- Ravlunda Cykel: Butiker | Sport & Fritid
update public.places set categories = 'Hotell & B&B', sub_category = 'Lägenhet & Stuga' where id = 333; -- Knappagården: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'B&B' where id = 334; -- Peppinge B&B: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'B&B' where id = 335; -- Strandbadsgården B&B: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'Lägenhet & Stuga' where id = 336; -- Mälarhusen Semesterby: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'B&B' where id = 337; -- Österlens Karlsgård: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'B&B' where id = 338; -- Borregården B&B: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'B&B' where id = 340; -- Lunkaberg B&B: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'B&B' where id = 341; -- Skönadal B&B: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'B&B' where id = 342; -- Wisteria Österlen: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B, Café & Bageri, Mat & Dryck', sub_category = 'B&B, Café, Casual' where id = 343; -- Hörnan på Brantevik: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'Lägenhet & Stuga' where id = 344; -- Huset på Hörnet: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'Hotell' where id = 345; -- Gladsax Gårdshotell: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'B&B' where id = 346; -- Torsborgs Gård: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'B&B' where id = 350; -- Munkamöllan Logi: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B, Mat & Dryck', sub_category = 'Hotell, Casual' where id = 351; -- Ekenäs Gård på Österlen: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'B&B' where id = 352; -- Elisetorp: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'B&B' where id = 353; -- Adagio på Österlen: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'Hotell' where id = 354; -- Kaptenshuset: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'B&B' where id = 355; -- Killegården på Kivik: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'Hotell, Spa' where id = 356; -- Kiviks Hotell: Hotell & B&B | -
update public.places set categories = 'Hotell & B&B', sub_category = 'B&B' where id = 359; -- Rubensholm B&B: Hotell & B&B | -
commit;

-- Orter (2026-11-10): rättade orter, kyrkornas orter, och varje ort har minst 3 platser. 79 ändringar.
begin;
delete from public.places where id in (203, 207); -- Qalops Butik & Galleri, Monica Persdotter Keramik & Form
update public.places set nearest_town = 'Löderup' where id = 5; -- Sandhammaren: "Sandhammaren"
update public.places set nearest_town = 'Hammenhög' where id = 6; -- Glimmingehus: "Glimminge"
update public.places set nearest_town = 'Rörum' where id = 9; -- Knäbäckshusens strand: "Knäbäckshusen"
update public.places set nearest_town = 'Tomelilla' where id = 19; -- Tomelilla kyrka: null
update public.places set nearest_town = 'Hannas' where id = 25; -- Östra Ingelstads kyrka: null
update public.places set nearest_town = 'Smedstorp' where id = 27; -- Smedstorps kyrka: null
update public.places set nearest_town = 'Sankt Olof' where id = 33; -- Dressin på Österlen – Gyllebosjö: "Gyllebo"
update public.places set nearest_town = 'Tomelilla' where id = 34; -- Dressin på Österlen – Fyledalen: "Fyledalen"
update public.places set nearest_town = 'Tomelilla' where id = 44; -- Tryde kyrka: null
update public.places set nearest_town = 'Skåne-Tranås' where id = 45; -- Spjutstorps kyrka: null
update public.places set nearest_town = 'Kivik' where id = 47; -- Hvitaby Järnvägshotell: "Vitaby"
update public.places set nearest_town = 'Skillinge' where id = 54; -- Östra Hoby kyrka: null
update public.places set nearest_town = 'Löderup' where id = 57; -- Valleberga kyrka: null
update public.places set nearest_town = 'Glemmingebro' where id = 58; -- Ingelstorps kyrka: null
update public.places set nearest_town = 'Löderup' where id = 61; -- Hörups kyrka: null
update public.places set nearest_town = 'Borrby' where id = 63; -- Borrby kyrka: null
update public.places set nearest_town = 'Hammenhög' where id = 64; -- Glivarpagården: "Glimminge"
update public.places set nearest_town = 'Hannas' where id = 68; -- Hannas kyrka: null
update public.places set nearest_town = 'Bollerup' where id = 70; -- Bollerups kyrka: null
update public.places set nearest_town = 'Hammenhög' where id = 71; -- Hammenhögs kyrka: null
update public.places set nearest_town = 'Bollerup' where id = 72; -- Tosterups kyrka: null
update public.places set nearest_town = 'Köpingebro' where id = 79; -- Stora Köpinge kyrka: null
update public.places set nearest_town = 'Hannas' where id = 83; -- Kverrestads kyrka: null
update public.places set nearest_town = 'Glemmingebro' where id = 92; -- Pastafabriken i Ingelstorp: "Ingelstorp"
update public.places set nearest_town = 'Smedstorp' where id = 105; -- Ingelsta Kalkon: "Ingelstorp"
update public.places set nearest_town = 'Skåne-Tranås' where id = 109; -- Crêperie & Café Madame Blå: "Skåne Tranås"
update public.places set nearest_town = 'Simrishamn' where id = 123; -- Bengtssons Loge: "Gröstorp"
update public.places set nearest_town = 'Östra Tommarp' where id = 124; -- Österlen Kokkonst: "Österlen"
update public.places set nearest_town = 'Östra Tommarp' where id = 133; -- Bolshögs kyrka: null
update public.places set nearest_town = 'Östra Tommarp' where id = 134; -- Norrmans Conditori: "Gärsnäs"
update public.places set nearest_town = 'Gislöv' where id = 136; -- Östra Nöbbelövs kyrka: null
update public.places set nearest_town = 'Skåne-Tranås' where id = 138; -- Österlenchoklad: "Skåne Tranås"
update public.places set nearest_town = 'Ravlunda' where id = 141; -- Ravlunda Hantverksbageri: "Brösarp"
update public.places set nearest_town = 'Löderup' where id = 144; -- Sandhammarens Fyrgrill: "Sandhammren"
update public.places set nearest_town = 'Gislöv' where id = 152; -- Simris kyrka: null
update public.places set nearest_town = 'Gislöv' where id = 154; -- Järrestads kyrka: null
update public.places set nearest_town = 'Östra Tommarp' where id = 156; -- Östra Tommarps kyrka: null
update public.places set nearest_town = 'Ravlunda' where id = 169; -- Havängsdösen: "Haväng"
update public.places set nearest_town = 'Rörum' where id = 170; -- Gyllebosjön: "Gyllebo"
update public.places set nearest_town = 'Gladsax' where id = 173; -- Gladsax kyrka: null
update public.places set nearest_town = 'Gladsax' where id = 175; -- Östra Vemmerlövs kyrka: null
update public.places set nearest_town = 'Skåne-Tranås' where id = 176; -- Onslunda kyrka: null
update public.places set nearest_town = 'Löderup' where id = 178; -- Gårdsateljén Österlen: "Löderup\n"
update public.places set nearest_town = 'Baskemölla' where id = 182; -- ÖSKG / Tjörnedala Konsthall: "Simrishamn"
update public.places set nearest_town = 'Smedstorp' where id = 186; -- Stiby kyrka: null
update public.places set nearest_town = 'Skåne-Tranås' where id = 187; -- Tranås kyrka: null
update public.places set nearest_town = 'Hammenhög' where id = 188; -- Östra Herrestads kyrka: null
update public.places set nearest_town = 'Rörum' where id = 189; -- Rörums kyrka: null
update public.places set nearest_town = 'Kivik' where id = 191; -- Södra Mellby kyrka: null
update public.places set nearest_town = 'Skåne-Tranås' where id = 194; -- Fågeltofta kyrka: null
update public.places set nearest_town = 'Kivik' where id = 197; -- Vitaby kyrka: null
update public.places set nearest_town = 'Brösarp' where id = 198; -- Eljaröds kyrka: null
update public.places set nearest_town = 'Gislöv' where id = 199; -- Ateljé Gamlegård Österlen: "Borrby"
update public.places set nearest_town = 'Kivik' where id = 201; -- Ateljé Ekberga Österlen: "Hammenhög"
update public.places set nearest_town = 'Sankt Olof' where id = 202; -- Korrebo Galleri: "Hammenhög"
update public.places set nearest_town = 'Skåne-Tranås' where id = 209; -- Österlen Inredning: "Simrishamn"
update public.places set nearest_town = 'Löderup' where id = 210; -- Kringstad Interiör: "Borrby"
update public.places set nearest_town = 'Brösarp' where id = 211; -- Brösarps kyrka: null
update public.places set nearest_town = 'Skillinge' where id = 214; -- Lunnabjär gravfält: "Hammenhög"
update public.places set nearest_town = 'Östra Tommarp' where id = 220; -- Tågarpsdösen: "Smedstorp"
update public.places set nearest_town = 'Smedstorp' where id = 223; -- Alnabjär skeppssättning: "S:t Olof"
update public.places set nearest_town = 'Löderup' where id = 241; -- Argilla Krukmakeri: "Kåseberga"
update public.places set nearest_town = 'Skillinge' where id = 245; -- Jansro Hem & Trädgård: "Borrby"
update public.places set nearest_town = 'Kivik' where id = 257; -- Kastanjegården på Stenshuvud: "Rörum"
update public.places set nearest_town = 'Bollerup' where id = 259; -- Galleri1: "Tomelilla"
update public.places set nearest_town = 'Smedstorp' where id = 263; -- Leif Handlare: "Glemmingebro"
update public.places set nearest_town = 'Skåne-Tranås' where id = 282; -- Åsgårds Gårdsbutik: "Hammenhög"
update public.places set nearest_town = 'Östra Tommarp' where id = 288; -- Häggs Livs: "Gärsnäs"
update public.places set nearest_town = 'Köpingebro' where id = 310; -- Kabusa Art Gallery: "Glemmingebro"
update public.places set nearest_town = 'Ravlunda' where id = 322; -- Ravlunda Cykel: "Kivik"
update public.places set nearest_town = 'Glemmingebro' where id = 333; -- Knappagården: "Löderup"
update public.places set nearest_town = 'Löderup' where id = 336; -- Mälarhusen Semesterby: "Borrby"
update public.places set nearest_town = 'Gislöv' where id = 341; -- Skönadal B&B: "Kivik"
update public.places set nearest_town = 'Gislöv' where id = 342; -- Wisteria Österlen: "Hammenhög"
update public.places set nearest_town = 'Skåne-Tranås' where id = 350; -- Munkamöllan Logi: "Skåne Tranås"
update public.places set nearest_town = 'Kivik' where id = 353; -- Adagio på Österlen: "Borrby"
update public.places set nearest_town = 'Kivik' where id = 354; -- Kaptenshuset: "Skillinge"
update public.places set nearest_town = 'Brösarp' where id = 359; -- Rubensholm B&B: "Tomelilla"
update public.places set nearest_town = 'Löderup' where id = 360; -- Löderups kyrka: null
commit;

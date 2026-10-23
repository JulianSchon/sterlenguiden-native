-- 058: Lekplatser som servicepunkter (typen "Lekplats")
--
-- 44 lekplatser på Österlen från OpenStreetMap (© OpenStreetMap-bidragsgivare, ODbL), hämtade
-- 2026-10-24. Privata lekplatser (skolor, förskolor) är inte med. De utan eget namn heter efter
-- närmaste by eller ort. Fler lekplatser läggs till direkt i tabellen service_points.
-- Går att köra flera gånger: en lekplats som redan finns (samma ställe) läggs inte in igen.

insert into public.service_points (type, name, lat, lng)
select 'Lekplats', v.name, v.lat, v.lng
from (values
  ('Lekplats, Tomelilla', 55.534485, 13.939115),
  ('Lekplats, Tomelilla', 55.549928, 13.944551),
  ('Lekplats, Kåseberga', 55.385892, 14.064274),
  ('Lekplats, Vitaby', 55.688083, 14.154116),
  ('Lekplats, Kivik', 55.688111, 14.224734),
  ('Lekplats, Borrby', 55.458157, 14.179029),
  ('Lekplats, Löderup', 55.440675, 14.110475),
  ('Lekplats, Löderup', 55.433036, 14.112100),
  ('Lekplats, Kivik', 55.684412, 14.225189),
  ('Lekplats, Baskemölla', 55.593079, 14.310801),
  ('Lekplats, Onslunda', 55.598076, 14.057713),
  ('Lekplats, Tomelilla', 55.536778, 13.945934),
  ('Lekplats, Tomelilla', 55.537394, 13.948826),
  ('Lekplats, Brösarp', 55.725733, 14.108621),
  ('Lekplats, Brösarp', 55.724622, 14.097570),
  ('Lekplats, Östra Vemmerlöv', 55.583216, 14.232205),
  ('Lekplats, Nyhem', 55.616812, 14.276523),
  ('Lekplats, Skillinge', 55.473753, 14.280844),
  ('Lekplats, Brösarp', 55.726383, 14.104803),
  ('Lekplats, Lövestad', 55.651216, 13.893660),
  ('Lekplats, Lövestad', 55.653982, 13.887585),
  ('Lekplats, Äsperöd', 55.609931, 13.918067),
  ('Lekplats, Nybrostrand', 55.435814, 13.940833),
  ('Lekplats, Kåseberga', 55.386914, 14.066044),
  ('Lekplats, Ravlunda', 55.708692, 14.150712),
  ('Lekplats, Simrishamn', 55.559723, 14.336930),
  ('Lekplats, Simrishamn', 55.556839, 14.338489),
  ('Lekplats, Tomelilla', 55.543095, 13.966785),
  ('Lekplats, Svenstorp', 55.481400, 13.946520),
  ('Lekplats, Öja', 55.432719, 13.864098),
  ('Lekplats, Hammenhög', 55.505353, 14.152090),
  ('Lekplats, Hammenhög', 55.504220, 14.148708),
  ('Lekplats, Mälarhusen', 55.413388, 14.198710),
  ('Lekplats Ponnygatan', 55.540934, 14.342617),
  ('Lekplats Korngatan', 55.541779, 14.352046),
  ('Lekplats, Annelund', 55.544452, 14.344570),
  ('Lekplats, Annelund', 55.543672, 14.341196),
  ('Lekplats, Nybro', 55.438164, 13.936033),
  ('Lekplats, Ystad', 55.426129, 13.850794),
  ('Lekplats, Sankt Olof', 55.636091, 14.131023),
  ('Lekplats, Simris', 55.536937, 14.325393),
  ('Lekplats, Brantevik', 55.516145, 14.345290),
  ('Lekplats, Gärsnäs', 55.543906, 14.187230),
  ('Lekplats, Skåne-Tranås', 55.614340, 13.994093)
) as v(name, lat, lng)
where not exists (
  select 1 from public.service_points s
  where s.type = 'Lekplats' and abs(s.lat - v.lat) < 0.0002 and abs(s.lng - v.lng) < 0.0003
);

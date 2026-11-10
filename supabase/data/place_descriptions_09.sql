-- Omgång 9 (2026-11-10): Byvägen Simrishamn Fratelli heter numera Hamnlyckan (restaurang vid hamnplan).
begin;
update public.places set
  name = 'Hamnlyckan',
  categories = 'Mat & Dryck',
  sub_category = 'Casual',
  instagram_url = 'https://www.instagram.com/hamnlyckan/',
  facebook_url = 'https://www.facebook.com/ByvagenSimrishamn/',
  short_description = 'Galetter och crêpes vid hamnen i Simrishamn',
  description = 'Hamnlyckan är en restaurang vid hamnplanen i Simrishamn, i lokalen där Byvägen tidigare hade kafé. Här står franska galetter, tunna bovetepannkakor med matig fyllning, och söta crêpes i centrum, tillsammans med annan lättare bistromat. Vin, öl och cider serveras från tapp. Inredningen har ett marint tema med knoptavlor, dykarhjälmar och sjömålningar, under kristallkronor. Bakom restaurangen står Mattis Holgersson från Byvägen 35 i Sankt Olof, tillsammans med kocken Hamza Abou Shahin och brodern Api Holgersson. Ett trevligt ställe att äta och träffas med utsikt mot hamnen.'
where id = 73; -- Byvägen Simrishamn Fratelli → Hamnlyckan
commit;

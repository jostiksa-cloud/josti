INSERT INTO ports (code, name_en, name_ar, latitude, longitude) VALUES
  ('JED', 'Jeddah Islamic Port', 'ميناء جدة الإسلامي', 21.4858, 39.1925),
  ('RAB', 'Rabigh', 'رابغ', 22.7986, 39.0347),
  ('YAN', 'Yanbu Commercial Port', 'ميناء ينبع التجاري', 24.0889, 38.0618),
  ('DMM', 'King Abdulaziz Port, Dammam', 'ميناء الملك عبدالعزيز بالدمام', 26.4344, 50.1033);

INSERT INTO container_types (code, name_en, name_ar) VALUES
  ('20ft', '20-foot container', 'حاوية 20 قدم'),
  ('40ft', '40-foot container', 'حاوية 40 قدم'),
  ('40ft_hc', '40-foot high cube', 'حاوية 40 قدم عالية'),
  ('45ft', '45-foot container', 'حاوية 45 قدم'),
  ('reefer_20', '20-foot reefer', 'حاوية مبردة 20 قدم'),
  ('reefer_40', '40-foot reefer', 'حاوية مبردة 40 قدم');

INSERT INTO truck_types (code, name_en, name_ar) VALUES
  ('flatbed', 'Flatbed', 'سطحة'),
  ('lowbed', 'Lowbed', 'لوبد'),
  ('side_loader', 'Side loader', 'سايد لودر'),
  ('container_chassis', 'Container chassis', 'شاسيه حاويات'),
  ('reefer', 'Reefer truck', 'شاحنة مبردة');

INSERT INTO truck_container_compatibility (truck_type, container_type) VALUES
  ('flatbed', '20ft'), ('flatbed', '40ft'), ('flatbed', '40ft_hc'),
  ('lowbed', '20ft'), ('lowbed', '40ft'), ('lowbed', '40ft_hc'), ('lowbed', '45ft'),
  ('side_loader', '20ft'), ('side_loader', '40ft'), ('side_loader', '40ft_hc'),
  ('container_chassis', '20ft'), ('container_chassis', '40ft'), ('container_chassis', '40ft_hc'), ('container_chassis', '45ft'),
  ('reefer', 'reefer_20'), ('reefer', 'reefer_40');

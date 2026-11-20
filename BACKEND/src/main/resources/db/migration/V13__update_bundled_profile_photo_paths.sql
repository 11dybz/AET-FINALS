-- Only update references to bundled images. Uploaded photos and external URLs stay intact.
UPDATE profiles SET image = REPLACE(image, '.jpg', '.png')
WHERE image IN ('/images/chee.jpg', 'images/chee.jpg', '/images/greg.jpg', 'images/greg.jpg',
                '/images/dave.jpg', 'images/dave.jpg', '/images/justin.jpg', 'images/justin.jpg');

UPDATE profile_images SET source_url = REPLACE(source_url, '.jpg', '.png')
WHERE source_url IN ('/images/chee.jpg', 'images/chee.jpg', '/images/greg.jpg', 'images/greg.jpg',
                     '/images/dave.jpg', 'images/dave.jpg', '/images/justin.jpg', 'images/justin.jpg');

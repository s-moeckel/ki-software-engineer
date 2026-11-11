CREATE TABLE IF NOT EXISTS books (
  id text NOT NULL PRIMARY KEY CHECK (length(trim(id)) > 0),
  isbn text NOT NULL UNIQUE CHECK (length(trim(isbn)) > 0),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  subtitle text NOT NULL DEFAULT '',
  author text NOT NULL CHECK (length(trim(author)) > 0),
  publisher text NOT NULL,
  "numPages" integer NOT NULL CHECK ("numPages" > 0),
  price text NOT NULL,
  cover text NOT NULL,
  abstract text NOT NULL,
  "userId" integer NOT NULL
) STRICT;

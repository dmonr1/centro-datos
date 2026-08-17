from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

from .config import settings


@contextmanager
def get_connection():
    with psycopg.connect(**settings.database_kwargs, row_factory=dict_row) as conn:
        yield conn


def fetch_one(query: str, params: tuple = ()):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchone()


def fetch_all(query: str, params: tuple = ()):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()


def execute(query: str, params: tuple = ()):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            try:
                return cur.fetchone()
            except psycopg.ProgrammingError:
                return None

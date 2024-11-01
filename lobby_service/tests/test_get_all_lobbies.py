import unittest
from unittest.mock import MagicMock
from db.models import Lobby
from management.lobby_manager import LobbyManager


class TestGetAllLobbies(unittest.TestCase):

    def setUp(self):
        self.mock_db = MagicMock()
        self.mock_redis_cache = MagicMock()
        self.manager = LobbyManager(self.mock_db, self.mock_redis_cache)

    def test_get_all_returns_cached_lobbies(self):
        cached_lobbies = '[{"id": 1, "train_id": "1"}, {"id": 2, "train_id": "2"}]'
        self.mock_redis_cache.get.return_value = cached_lobbies

        result = self.manager.get_all()

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['id'], 1)

        self.mock_db.query.assert_not_called()

    def test_get_all_returns_from_db_if_no_cache(self):
        self.mock_redis_cache.get.return_value = None

        mock_lobbies = [
            Lobby(id=1, train_id=1),
            Lobby(id=2, train_id=2)
        ]
        self.mock_db.query(Lobby).all.return_value = mock_lobbies

        result = self.manager.get_all()

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0].id, 1)

        self.mock_redis_cache.setex.assert_called_once()


if __name__ == '__main__':
    unittest.main()

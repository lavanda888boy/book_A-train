import unittest
from unittest.mock import MagicMock
from db.models import Lobby
from management.lobby_manager import LobbyManager
from fastapi import HTTPException


class TestCreateLobby(unittest.TestCase):

    def setUp(self):
        self.mock_db = MagicMock()
        self.mock_redis_cache = MagicMock()
        self.manager = LobbyManager(self.mock_db, self.mock_redis_cache)

    def test_create_returns_http_exception(self):
        lobby = Lobby(id=1, train_id=1)
        self.mock_db.query.return_value.filter.return_value.first.return_value = lobby
        self.assertRaises(HTTPException, self.manager.create, lobby)

    def test_create_returns_created_lobby_id(self):
        lobby = Lobby(id=1, train_id=1)

        self.mock_db.query.return_value.filter.return_value.first.return_value = None
        self.mock_db.add.side_effect = lambda l: setattr(l, 'id', 1)
        self.mock_db.commit.return_value = None
        self.mock_db.refresh.return_value = None
        self.mock_redis_cache.delete.return_value = None

        result = self.manager.create(lobby)

        self.assertEqual(result, 1)
        self.mock_db.query.return_value.filter.return_value.first.assert_called_once()
        self.mock_db.add.assert_called_once()
        self.mock_redis_cache.delete.assert_called_once()


if __name__ == '__main__':
    unittest.main()

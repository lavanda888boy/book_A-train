import unittest
from unittest.mock import MagicMock
from db.models import Lobby
from management.lobby_manager import LobbyManager
from fastapi import HTTPException


class TestDeleteLobbyById(unittest.TestCase):

    def setUp(self):
        self.mock_db = MagicMock()
        self.mock_redis_cache = MagicMock()
        self.manager = LobbyManager(self.mock_db, self.mock_redis_cache)

    def test_delete_by_id_returns_http_exception(self):
        lobby_id = 1
        self.mock_db.query.return_value.filter.return_value.first.return_value = None
        self.assertRaises(HTTPException, self.manager.delete, lobby_id)

    def test_delete_by_id_returns_deleted_lobby_id(self):
        lobby = Lobby(id=1, train_id=1)
        self.mock_db.query.return_value.filter.return_value.first.return_value = lobby
        self.mock_redis_cache.delete.return_value = None

        result = self.manager.delete(lobby.id)

        self.assertEqual(result, 1)
        self.mock_db.query.return_value.filter.return_value.first.assert_called_once()
        self.mock_db.delete.assert_called_once()
        self.mock_redis_cache.delete.assert_called_once()


if __name__ == '__main__':
    unittest.main()

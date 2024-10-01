# import unittest
# from unittest.mock import MagicMock
# from db.models import Lobby
# from management.lobby_manager import LobbyManager
# from fastapi import HTTPException


# class TestDeleteLobbyById(unittest.TestCase):

#     def setUp(self):
#         self.mock_db = MagicMock()
#         self.mock_redis_cache = MagicMock()
#         self.manager = LobbyManager(self.mock_db, self.mock_redis_cache)


#     def test_get_by_id_returns_http_exception(self):
#         lobby_id = 1
#         self.mock_db.query.return_value.filter.return_value.first.return_value = None
#         self.assertRaises(HTTPException, self.manager.get_by_id, lobby_id)


#     def test_get_by_id_returns_lobby_from_db(self):
#         lobby = Lobby(id=1, train_id=1)
#         self.mock_db.query.return_value.filter.return_value.first.return_value = lobby

#         result = self.manager.get_by_id(lobby.id)

#         self.assertEqual(result.id, 1)
#         self.mock_db.query.return_value.filter.return_value.first.assert_called_once()


# if __name__ == '__main__':
#     unittest.main()
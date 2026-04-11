import pytest
from unittest.mock import patch

# Adjust this import to match your actual file structure
from app.services.retriever import (
    count_total_articles,
    sentiment_scores,
    lga_aggregate,
    stat_score
)

class TestRetrieverMathLogic:
    def test_count_total_articles(self):
        """Tests that articles are counted correctly per LGA, ignoring missing LGAs."""
        mock_events = [
            {"lga": "Sydney"},
            {"lga": "Sydney"},
            {"lga": "Parramatta"},
            {"lga": "LGA not found"}, # Should be ignored
            {"lga": None} # Edge case
        ]
        
        result = count_total_articles(mock_events)
        
        assert result["Sydney"] == 2
        assert result["Parramatta"] == 1
        assert "LGA not found" not in result
        
    def test_sentiment_scores(self):
        """Tests that sentiment scores are averaged correctly per LGA."""
        mock_events = [
            {"lga": "Sydney", "sentiment_score": 0.8},
            {"lga": "Sydney", "sentiment_score": 0.4}, # Average for Sydney = 0.6
            {"lga": "Parramatta", "sentiment_score": 0.5},
            {"lga": "Sydney", "sentiment_score": None}, # Should be ignored
            {"lga": "LGA not found", "sentiment_score": 0.9} # Should be ignored
        ]
        
        result = sentiment_scores(mock_events)
        
        assert result["Sydney"] == pytest.approx(0.6)
        assert result["Parramatta"] == pytest.approx(0.5)
        assert "LGA not found" not in result

    @patch.dict('app.services.retriever.LGA_FORMAT_MAP', {'SYD_RAW': 'Sydney'})
    @patch.dict('app.services.retriever.CRIME_WEIGHTS', {'theft': 2, 'assault': 5})
    def test_lga_aggregate(self):
        """Tests crime weighting and counting aggregation."""
        mock_events = [
            {"lga": "SYD_RAW", "offence_type": "theft", "offence_count": 3},   # Weight: 3 * 2 = 6
            {"lga": "SYD_RAW", "offence_type": "assault", "offence_count": 1}, # Weight: 1 * 5 = 5. Total = 11
            {"lga": "UNKNOWN", "offence_type": "theft", "offence_count": 1}    # Should be ignored
        ]
        
        result = lga_aggregate(mock_events)
        
        assert result["Sydney"]["total_crimes"] == 4  # 3 thefts + 1 assault
        assert result["Sydney"]["weighted_crime_score"] == 11
        assert "Unknown" not in result

    @patch('app.services.retriever.get_lga_population')
    def test_stat_score(self, mock_pop):
        """Tests the final statistical score calculation (Score = (Weight / Pop) * 100)."""
        # Set a fake population of 1000 for all calls
        mock_pop.return_value = 1000
        
        mock_lga_stats = {
            "Sydney": {"weighted_crime_score": 50, "total_crimes": 10}, # (50 / 1000) * 100 = 5.0
            "ZeroTown": {"weighted_crime_score": 0, "total_crimes": 0}  # (0 / 1000) * 100 = 0.0
        }
        
        result = stat_score(mock_lga_stats)
        
        assert result["Sydney"] == 5.0
        assert result["ZeroTown"] == 0.0

    @patch('app.services.retriever.get_lga_population')
    def test_stat_score_zero_population(self, mock_pop):
        """Tests that division by zero is avoided if population is 0 or -1."""
        mock_pop.return_value = 0 # Simulate missing population data
        
        mock_lga_stats = {
            "GhostTown": {"weighted_crime_score": 50, "total_crimes": 10}
        }
        
        result = stat_score(mock_lga_stats)
        
        # If pop is 0, the code `continue`s, so it shouldn't be in the result
        assert "GhostTown" not in result
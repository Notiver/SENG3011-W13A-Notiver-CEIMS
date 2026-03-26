import pytest
from unittest.mock import patch
from utils.crime_classifier import classify_crime 
from utils.location_classifier import get_location_metadata

class TestCrimeClassifier:
    def test_classify_crime_single_match(self):
        text = "The suspect was arrested for armed robbery at the local store."
        assert classify_crime(text) == "Robbery & Theft"

    def test_classify_crime_multiple_matches(self):
        text = "After the assault, they committed a robbery and another robbery."
        assert classify_crime(text) == "Robbery & Theft"

    def test_classify_crime_no_match(self):
        text = "The local council meeting discussed new parking regulations."
        assert classify_crime(text) == "General Crime"

class TestLocationMetadata:
    
    def test_get_location_metadata_match(self):
        mock_data = {"Redfern": {"councilname": "City Of Sydney", "postcode": "2016"}}
        mock_subs = ["Redfern"]
        
        with patch('utils.location_classifier.suburb_data', mock_data):
            with patch('utils.location_classifier.sorted_suburbs', mock_subs):
                text = "A major event happened in Redfern today."
                result = get_location_metadata(text)
                
                assert result["suburb"] == "Redfern"
                assert result["lga"] == "City Of Sydney"
                assert str(result["postcode"]) == "2016"

    def test_get_location_metadata_no_match(self):
        mock_subs = ["Redfern"]
        
        with patch('utils.location_classifier.sorted_suburbs', mock_subs):
            text = "A major event happened in Melbourne today."
            result = get_location_metadata(text)
            
            assert result["suburb"] == "NSW General"
            assert result["lga"] == "Unknown"
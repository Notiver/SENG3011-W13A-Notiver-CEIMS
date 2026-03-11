CRIME_CATEGORY_MAP = {
    # ---- Violent crimes ----
    "murder": "violent",
    "attempted murder": "violent",
    "murder accessory, conspiracy": "violent",
    "manslaughter": "violent",
    "domestic violence related assault": "violent",
    "non-domestic violence related assault": "violent",
    "assault Police": "violent",
    "sexual assault": "violent",
    "sexual touching, sexual act and other sexual offences": "violent",
    "abduction and kidnapping": "violent",

    # ---- Theft ----
    "robbery without a weapon": "theft",
    "robbery with a firearm": "theft",
    "robbery with a weapon not a firearm": "theft",
    "blackmail and extortion": "theft",
    "receiving or handling stolen goods": "theft",
    "steal from retail store": "theft",
    "steal from dwelling": "theft",
    "steal from person": "theft",
    "stock theft": "theft",
    "fraud": "theft",
    "other theft": "theft",
    "motor vehicle theft": "theft",
    "steal from motor vehicle": "theft",
    
    # ---- Property ----
    "arson": "property",
    "malicious damage to property": "property",
    "break and enter dwelling": "property",
    "break and enter non-dwelling": "property",
    "Trespass": "property",

    # ---- Drug offences ----
    "possession and/or use of cocaine": "drugs",
    "possession and/or use of narcotics": "drugs",
    "possession and/or use of cannabis": "drugs",
    "possession and/or use of amphetamines": "drugs",
    "possession and/or use of ecstasy": "drugs",
    "possession and/or use of other drugs": "drugs",
    "dealing, trafficking in cocaine": "drugs",
    "dealing, trafficking in narcotics": "drugs",
    "dealing, trafficking in cannabis": "drugs",
    "dealing, trafficking in amphetamines": "drugs",
    "dealing, trafficking in ecstasy": "drugs",
    "dealing, trafficking in other drugs": "drugs",
    "cultivating cannabis": "drugs",
    "manufacture drug": "drugs",
    "importing drugs": "drugs",
    "other drug offences": "drugs",

    # ---- Against judicial procedures ----
    "Escape custody": "judicial",
    "Breach Apprehended Violence Order": "judicial",
    "Breach bail conditions": "judicial",
    "Fail to appear": "judicial",
    "Resist or hinder officer": "judicial",
    "Other offences against justice procedures": "judicial",

    # ---- Other offences ----
    "Prohibited and regulated weapons offences": "other",
    "Betting and gaming offences": "other",
    "Liquor offences": "other",
    "Pornography offences": "other",
    "Other offences": "other",
    "Transport regulatory offences": "other",
    "Offensive conduct": "other",
    "Offensive language": "other",
    "Criminal intent": "other",
}

# Does the offence directly threaten life?
# │
# ├─ Yes → Score 9–10
# │     ├─ Intentional killing → 10
# │     ├─ Attempted killing → 9
# │     └─ Serious violent offences → 8
# │
# Does the offence involve physical harm or coercion?
# │
# ├─ Yes → Score 6–8
# │     ├─ Sexual assault / kidnapping → 8
# │     ├─ Assault / intimidation → 7
# │     └─ Police assault → 7
# │
# Does the offence involve serious property loss or robbery?
# │
# ├─ Yes → Score 5–7
# │     ├─ Armed robbery → 7
# │     ├─ Break & enter → 6
# │     └─ Theft / fraud → 5
# │
# Does the offence involve drugs?
# │
# ├─ Trafficking / manufacturing → 6
# ├─ Possession → 4
# │
# Is it justice system obstruction?
# │
# ├─ Yes → Score 3–5
# │
# Is it regulatory / minor public order?
# │
# └─ Yes → Score 1–3

CRIME_WEIGHTS = {

    # ---- Extreme violence ----
    "murder": 10,
    "attempted murder": 9,
    "murder accessory, conspiracy": 8,
    "manslaughter": 9,

    # ---- Serious violent offences ----
    "sexual assault": 9,
    "abduction and kidnapping": 9,
    "sexual touching, sexual act and other sexual offences": 7,

    # ---- Assault ----
    "domestic violence related assault": 8,
    "non-domestic violence related assault": 7,
    "assault police": 7,

    # ---- Robbery / theft ----
    "robbery with a firearm": 8,
    "robbery with a weapon not a firearm": 7,
    "robbery without a weapon": 6,
    "blackmail and extortion": 6,

    # ---- Burglary / property theft ----
    "break and enter dwelling": 6,
    "break and enter non-dwelling": 5,
    "steal from dwelling": 5,
    "steal from person": 5,
    "steal from retail store": 4,
    "stock theft": 4,
    "fraud": 5,
    "receiving or handling stolen goods": 4,
    "other theft": 3,

    # ---- Motor vehicle crime ----
    "motor vehicle theft": 5,
    "steal from motor vehicle": 4,

    # ---- Property damage ----
    "arson": 7,
    "malicious damage to property": 4,
    "trespass": 3,

    # ---- Drug offences (serious) ----
    "importing drugs": 8,
    "manufacture drug": 7,
    "dealing, trafficking in cocaine": 7,
    "dealing, trafficking in narcotics": 7,
    "dealing, trafficking in cannabis": 6,
    "dealing, trafficking in amphetamines": 7,
    "dealing, trafficking in ecstasy": 7,
    "dealing, trafficking in other drugs": 6,
    "cultivating cannabis": 5,

    # ---- Drug possession ----
    "possession and/or use of cocaine": 4,
    "possession and/or use of narcotics": 4,
    "possession and/or use of cannabis": 3,
    "possession and/or use of amphetamines": 4,
    "possession and/or use of ecstasy": 4,
    "possession and/or use of other drugs": 3,
    "other drug offences": 3,

    # ---- Judicial offences ----
    "escape custody": 6,
    "breach apprehended violence order": 5,
    "breach bail conditions": 4,
    "fail to appear": 3,
    "resist or hinder officer": 4,
    "other offences against justice procedures": 3,

    # ---- Other offences ----
    "prohibited and regulated weapons offences": 6,
    "betting and gaming offences": 2,
    "liquor offences": 2,
    "pornography offences": 3,
    "transport regulatory offences": 1,
    "offensive conduct": 2,
    "offensive language": 1,
    "criminal intent": 3,
    "other offences": 2
}

# Overall stats
# lga | sentiment | statistical | total crimes | total articles


# By year
# lga | year | sentiment | stats | total | violent | theft | property | drugs | judicial | other 


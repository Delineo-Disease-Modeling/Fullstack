# Delineo Website

Delineo website developed & ported to [React.JS](https://github.com/facebook/react).

Try it out: <https://delineo.me>

## Setup

You'll need to install [node](https://nodejs.org/) and [pnpm](https://pnpm.io/) first.

You want to install and run the Delineo [Simulator](https://github.com/Delineo-Disease-Modeling/Simulation) and [Database](https://github.com/Delineo-Disease-Modeling/Database) next.

Then, clone this repository locally and navigate to the `client` folder and create a `.env` file with the following schema:

```text
# Simulator server IP
VITE_API_URL=http://127.0.0.1:1880/

# Database server IP 
VITE_DB_URL=http://127.0.0.1:1890/

# If set to true, will use data from disk
VITE_USE_CACHED_DATA=FALSE
```

Then, while still in the `client` folder, run the following commands:

```bash
pnpm install
pnpm dev
```

talk about the data structures and how we store stuff in the database, uses postgresql to communicate with the database. We use postman as an endpoint api to test that our front end properly can properly fetch the convience zones by calling an api. Talk about the patterns.json and infectivity.json data structures and how we represent it with the key/value and the json format


## Data Structures
Delineo utilizes multiple JSON files to store and manage simulation data. These JSON structures define population movement, housing arrangements, and disease infectivity across various timesteps. The key files involved are patterns.json, papdata.json, and infectivity.json.

### patterns.json ###
This file captures the movement patterns within the simulation at specific timesteps. Each entry represents a timestep key mapped to homes and places pattern values, detailing which individuals are present at various locations. 

Structure:
```bash
{
    "60": {             // Timestep in minutes or simulation time unit
        "homes": {      // Home patterns
            "1": [      // Home ID
                "4", 
                "5"     // List of person IDs present at this home
            ]
        },
        "places": {
            "3": [      // Place ID
                "24", 
                "25"    // List of person IDs present at this place
            ]
        },
    }
}
```
- Each timestep (e.g., 60, 120, 180) is represented as a key.
- The homes key maps home IDs to lists of person IDs residing there.
- The places key maps place IDs to lists of person IDs visiting these locations.

### papdata.json ###
The papdata.json file contains demographic details for individuals in the simulation, including age, sex, and home location.

Structure:
```bash
{
    "people": {
        "0": {
            "sex": 0,       // 0: Male, 1: Female
            "age": 21,      // Age of person
            "home": "0"     // Home ID where the person resides
        },
        "1": {
            "sex": 1,
            "age": 21,
            "home": "0"
        }
    }
}
```
- The people key maps person IDs to their demographic information.
- Each person entry contains sex, age, and home details.
- This file is used to reference individuals in patterns.json.

### infectivitity.json ###
The infectivity.json file tracks the disease spread by recording the infectivity levels at various timesteps for different virus variants.

Structure:
```bash
{
    "60": {             // Timestep
        "delta": {      // Variant name
            "22": 3     // Person ID and infection state
        },
        "omicron": {
            "27": 3
        }
    }
}
```
- Each timestep (e.g., 0, 60, 120, 180) is a key.
- The keys under each timestep represent different virus variants (delta, omicron, etc.).
- Each variant maps person IDs to infection states, 

# Map And Garage Product Spec

## Purpose

This document records the agreed product direction for separating:

- `Map`
- `Garage`

inside OPTI-GAS.

It defines where trip assumptions live, when personalized presets are available, and how saved vehicles should behave in the demo system.

## Navigation

The app should expose exactly two primary destinations:

- `Map`
- `Garage`

There is no `Dashboard` in the current scope.

## Map Responsibilities

The `Map` remains the default landing experience.

It should:

- open immediately
- request current browser geolocation immediately
- show nearby stations
- support fuel-type, brand, and radius filtering
- show price, distance, and ETA
- allow navigation handoff with `Get Directions`

The Map must remain useful even before a vehicle profile is created.

There is no landmark picker in the current scope.

## Garage Responsibilities

The `Garage` owns saved vehicle profiles.

It should:

- store up to `5` vehicles only
- require deleting one vehicle before adding a sixth
- allow exactly one active vehicle at a time
- let the user edit or delete saved vehicles anytime
- let the user switch the active vehicle anytime

If the active vehicle changes while the map is open, the recommendation should refresh immediately.

## Saved Vehicle Model

Each saved vehicle should contain at minimum:

- `id`
- `nickname`
- `vehicle_family`
- `vehicle_subtype`
- `fuel_type`
- `tank_capacity_l`
- `km_per_liter`
- `is_active`

## Vehicle Entry Flow

Vehicle creation should be preset-first, not raw-manual-first.

Recommended flow:

1. choose vehicle family
2. choose vehicle subtype
3. auto-fill:
   - `fuel_type`
   - `tank_capacity_l`
   - `km_per_liter`
4. allow editing those values
5. save the vehicle

The user must always be allowed to edit:

- `tank_capacity_l`
- `km_per_liter`

after auto-fill.

## Vehicle Families And Subtypes

The UI should use a two-level selection:

1. vehicle family
2. vehicle subtype

Recommended structure:

- `Motorcycle`
  - `Scooter / Automatic`
  - `Underbone / Small Manual`
  - `Standard Motorcycle`
  - `Big Bike`
- `Car`
  - `Small Car / Hatchback`
  - `Sedan`
  - `MPV / Crossover`
  - `SUV / Pickup`
- `Van / Utility`
  - `Passenger Van`
  - `Light Utility Van`

These are approximation presets, not exact manufacturer values.

## First-Run Behavior

On first use, the app should not block the user from using the map.

Instead:

- the map still loads
- the user can browse stations immediately
- a soft prompt encourages them to set up a vehicle

Recommended prompt copy:

`Set up your vehicle once to unlock personalized cost-based recommendations.`

Recommended actions:

- `Set Up Now`
- `Maybe Later`

## Pre-Setup Recommendation Rules

If no saved vehicle exists yet:

- the map remains usable
- station browsing remains available
- fuel price, distance, and ETA remain available
- `Get Directions` remains available

Cost-based presets should not be fully available.

### Available Without A Vehicle

- `Save Time`

### Locked Without A Vehicle

- `Opti-Route`
- `Save Money`
- `Balanced`

Locked presets should remain visible but disabled, with an explanation such as:

`Add a vehicle in Garage to unlock personalized recommendations.`

## Reminder Behavior

If the user chooses `Maybe Later`:

- dismiss the first-run prompt for the current session
- lightly remind them again when they open the app later
- also remind them if they try to use a locked cost-based preset

## Fuel Type Behavior

`fuel_type` should be stored in the vehicle profile by default.

However, the Map should still allow changing fuel type per use case when needed.

## Tank Status Behavior

Tank status is not a permanent property of the vehicle itself.

The correct model is:

- Garage does not store tank status
- Map owns the current tank-status selection
- the user can override tank status on the Map per trip

Recommended preset values:

- `Empty`
- `Half`
- `Topping Up`

The current Map selection is the source of truth for the current recommendation request.

## Practical Recommendation Logic

The active saved vehicle should supply:

- `km_per_liter`
- `tank_capacity_l`
- default `fuel_type`

The Map should derive:

```text
liters_to_fill = tank_capacity_l * refill_fraction
```

using the current tank-status selection.

This replaces the older hidden constant/default-only model.

## Current Visual Direction

The current app theme should follow these rules:

- dark navy chrome for top controls, advisories, prompts, and bottom navigation
- muted cool blue-gray surfaces for sheets, cards, filters, and Garage
- white reserved for highest-elevation surfaces such as modal dialogs
- amber used for recommendation emphasis and active-state accents

When visual styling changes materially, this document should be updated in the same task.

## Documentation Rule

If the product interaction between Map and Garage changes, this document must be updated in the same task.

The paired design-engineering skill for this product surface lives at `skills/opti-gas-ui-design-engineering/SKILL.md`.

import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
 
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';


const C = {
  ink: '#101828',
  muted: '#667085',
  green: '#07966A',
  darkGreen: '#067647',
  pale: '#E8F7F1',
  border: '#E5E7EB',
  surface: '#F8FAFC',
  white: '#FFFFFF',
  orange: '#B54708',
};

const vendors = [
  {
    name: 'The Kapita Grand Bistro',
    area: 'Victoria Island',
    type: 'fine',
    cuisine: 'fine',
    rating: '4.8',
    eta: '25–35 min',
    image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80',
    description: 'Contemporary dining and signature meals.',
  },
  {
    name: 'Iya Basira Local Buka',
    area: 'Lekki Phase 1',
    type: 'buka',
    cuisine: 'swallow',
    rating: '4.9',
    eta: '20–30 min',
    image: 'https://images.unsplash.com/photo-1555126634-323283e090fa?auto=format&fit=crop&w=900&q=80',
    description: 'Authentic local meals, hot and freshly prepared.',
  },
  {
    name: 'Mama Tobi Bukateria',
    area: 'Yaba',
    type: 'buka',
    cuisine: 'buka',
    rating: '4.7',
    eta: '20–30 min',
    image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80',
    description: 'Everyday Nigerian favourites.',
  },
  {
    name: "Alhaji's Northern Suya",
    area: 'Surulere',
    type: 'buka',
    cuisine: 'suya',
    rating: '4.6',
    eta: '30–40 min',
    image: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=900&q=80',
    description: 'Grills, suya and northern-inspired specials.',
  },
  {
    name: 'Oleku Fine Dining & Lounge',
    area: 'Ikoyi',
    type: 'fine',
    cuisine: 'fine',
    rating: '4.8',
    eta: '35–45 min',
    image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=80',
    description: 'A relaxed fine-dining experience.',
  },
  {
    name: 'Crust & Cream Bakery',
    area: 'Victoria Island',
    type: 'fine',
    cuisine: 'pastry',
    rating: '4.5',
    eta: '20–30 min',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80',
    description: 'Fresh pastries, cakes and drinks.',
  },
];

const dishes = [
  {
    name: 'Special Smoked Jollof',
    description: 'Served with fried plantains, grilled chicken & coleslaw.',
    price: 4500,
    vendor: 'The Kapita Grand Bistro',
    image: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Abula Combo (Buka Special)',
    description: 'Hot Amala with Gbegiri, Ewedu and tender goat meat.',
    price: 3800,
    vendor: 'Iya Basira Local Buka',
    image: 'https://images.unsplash.com/photo-1555126634-323283e090fa?auto=format&fit=crop&w=800&q=80',
  },
];

const cash = n => `₦${Number(n).toLocaleString('en-NG')}`;

function Button({ title, onPress, secondary = false, style }) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.button, secondary && s.buttonSecondary, style]}
    >
      <Text style={[s.buttonText, secondary && s.buttonSecondaryText]}>
        {title}
      </Text>
    </Pressable>
  );
}

function Heading({ title, subtitle, right }) {
  return (
    <View style={s.heading}>
      <View style={{ flex: 1 }}>
        <Text style={s.h2}>{title}</Text>
        {!!subtitle && <Text style={s.sub}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

function Sheet({ visible, title, subtitle, close, children }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.sheetTitle}>{title}</Text>
              {!!subtitle && <Text style={s.sub}>{subtitle}</Text>}
            </View>
            <Pressable onPress={close} style={s.close}>
              <Text style={{ fontSize: 24, color: C.ink }}>×</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function FoodScreen() {
  const [mode, setMode] = useState('all');
  const [cuisine, setCuisine] = useState('all');
  const [search, setSearch] = useState('');

  const [location, setLocation] = useState('Victoria Island, Lagos');
  const [headerLocation, setHeaderLocation] = useState('Yaba, Lagos');

  const [aiOpen, setAiOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState('');

  const [dish, setDish] = useState(dishes[0]);
  const [qty, setQty] = useState(1);

  const [restaurant, setRestaurant] = useState(vendors[0].name);
  const [date, setDate] = useState('2026-11-02');
  const [time, setTime] = useState('19:00');
  const [guests, setGuests] = useState('2');

  const [vendorName, setVendorName] = useState('');
  const [vendorType, setVendorType] = useState('Authentic Local Buka');
  const [vendorAddress, setVendorAddress] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');

  const [budget, setBudget] = useState('4000');
  const [preference, setPreference] = useState('Surprise Me With Anything');
  const [roulette, setRoulette] = useState(null);

  const filtered = useMemo(
    () =>
      vendors.filter(
        v =>
          (mode === 'all' || v.type === mode) &&
          (cuisine === 'all' ||
            v.cuisine === cuisine ||
            (cuisine === 'buka' && v.type === 'buka')) &&
          (!search.trim() ||
            `${v.name} ${v.area} ${v.description}`
              .toLowerCase()
              .includes(search.trim().toLowerCase())),
      ),
    [mode, cuisine, search],
  );

  const openDish = d => {
    setDish(d);
    setQty(1);
    setModal('dish');
  };

  const show = m => {
    setMenuOpen(false);
    setModal(m);
  };

  const reserve = () => {
    if (!date || !time || Number(guests) < 1) {
      return Alert.alert(
        'Check your booking',
        'Enter a date, time and valid number of guests.',
      );
    }

    setModal('');
    Alert.alert(
      'Reservation request saved',
      `Your table request for ${restaurant} has been recorded in this demo.`,
    );
  };

  const applyVendor = () => {
    if (!vendorName.trim() || !vendorAddress.trim() || !vendorPhone.trim()) {
      return Alert.alert(
        'Missing information',
        'Please complete all vendor application fields.',
      );
    }

    setModal('');
    Alert.alert(
      'Application received',
      'Your vendor application has been recorded in this demo.',
    );

    setVendorName('');
    setVendorAddress('');
    setVendorPhone('');
  };

  const spin = () => {
    const choices = dishes.filter(d => d.price <= Number(budget || 0));

    if (!choices.length) {
      return Alert.alert('No match found', 'Try increasing your budget.');
    }

    setRoulette(choices[Math.floor(Math.random() * choices.length)]);
  };
    return (
    // <SafeAreaView style={s.safe}>
    <SafeAreaView style={s.safe}  edges={[]}>
    
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />

      {/* Header */}
      <View style={s.headerContainer}>
        <View style={s.header}>
          <Pressable
            style={s.back}
            onPress={() =>
              Alert.alert('theKapita', 'Connect this action to your home route.')
            }
          >
            <Text style={s.backText}>‹</Text>
          </Pressable>

          <View style={{ flex: 1, marginLeft: 9 }}>
            <Text style={s.brand}>
              theKapita<Text style={{ color: C.green }}>.</Text>
            </Text>
            <Text style={s.brandSub}>Food</Text>
          </View>

          <Pressable
            style={s.locationPill}
            onPress={() =>
              Alert.alert(
                'Delivery location',
                `Current location: ${headerLocation}. You can edit the delivery location in the field below.`,
              )
            }
          >
            <Text style={{ color: C.green }}>⌖ </Text>
            <Text numberOfLines={1} style={s.locationText}>
              {headerLocation}
            </Text>
            <Text style={s.sub}>⌄</Text>
          </Pressable>

          <Pressable style={s.account} onPress={() => setMenuOpen(v => !v)}>
            <Text>●⌄</Text>
          </Pressable>
        </View>
      </View>
      {/* Account dropdown */}
      {menuOpen && (
        <View style={s.dropdown}>
          <Pressable
            style={s.balance}
            onPress={() =>
              Alert.alert('Escrow Wallet', 'Cleared balance: ₦48,500.00')
            }
          >
            <Text style={s.sub}>Cleared Escrow Wallet</Text>
            <Text style={s.balanceValue}>₦48,500.00</Text>
          </Pressable>

          {[
            ['Reserve a Table', 'reservation'],
            ['My Table Reservations', 'reservations'],
            ['Taste-Test Roulette', 'roulette'],
            ['Taste-Buddy Split', 'buddy'],
            ['Escrow Order History', 'history'],
          ].map(([label, key]) => (
            <Pressable
              key={key}
              style={s.dropItem}
              onPress={() => show(key)}
            >
              <Text style={s.body}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Service mode */}
        <View style={s.modeRow}>
          {[
            ['all', 'Explore & Order'],
            ['buka', 'Authentic Buka'],
            ['fine', 'Fine Dining'],
          ].map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => {
                setMode(key);
                setCuisine('all');
              }}
              style={[s.modeBtn, mode === key && s.modeActive]}
            >
              <Text
                style={[
                  s.modeText,
                  mode === key && { color: C.white },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* AI recommendation */}
        {aiOpen ? (
          <View style={s.ai}>
            <View style={s.row}>
              <Text style={s.aiTitle}>✦ theKapita Assistant</Text>
              <Pressable onPress={() => setAiOpen(false)}>
                <Text style={s.sub}>×</Text>
              </Pressable>
            </View>

            <Pressable
              style={s.aiBody}
              onPress={() => openDish(dishes[1])}
            >
              <Text style={[s.body, { flex: 1 }]}>
                Time for your usual Abula Combo from{' '}
                <Text style={{ fontWeight: '900' }}>Iya Basira</Text>?
              </Text>
              <Text style={s.price}>₦3,800 ›</Text>
            </Pressable>
          </View>
        ) : (
          <Button
            title="✦ Open theKapita recommendation"
            secondary
            onPress={() => setAiOpen(true)}
          />
        )}

        {/* Location and search */}
        <View style={s.locationCard}>
          <Text style={s.label}>DELIVERY LOCATION</Text>
          <TextInput
            value={location}
            onChangeText={setLocation}
            style={s.input}
          />

          <Text style={s.label}>SEARCH FOOD</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search dish, buka, or restaurant name..."
            style={s.input}
          />
        </View>

        {/* Cuisine filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
        >
          {[
            ['all', 'All Vendors'],
            ['buka', 'Local Buka 🔥'],
            ['swallow', 'Swallows & Soups'],
            ['fine', 'Fine Dining'],
            ['suya', 'Grills & Suya'],
            ['pastry', 'Pastries & Drinks'],
          ].map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setCuisine(key)}
              style={[s.chip, cuisine === key && s.chipActive]}
            >
              <Text
                style={[
                  s.chipText,
                  cuisine === key && { color: C.darkGreen },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Vendor partnership banner */}
        <Pressable
          style={s.vendorBanner}
          onPress={() => show('vendor')}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.vendorTitle}>Are you a Food Vendor?</Text>
            <Text style={s.vendorSub}>
              List dishes, get orders, and dispatch fast.
            </Text>
          </View>
          <Text style={s.partner}>Partner Up</Text>
        </Pressable>

        {/* Restaurant list */}
        <Heading
          title="Top Restaurants & Local Bukas"
          subtitle="Curated dining spots with fast delivery dispatch"
          right={<Text style={s.count}>{filtered.length} vendors</Text>}
        />

        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.h2}>No vendors found</Text>
            <Text style={s.sub}>Try another search or category.</Text>
          </View>
        ) : (
          filtered.map(v => (
            <Pressable
              key={v.name}
              style={s.vendorCard}
              onPress={() =>
                Alert.alert(
                  v.name,
                  'Connect this card to the vendor menu route.',
                )
              }
            >
              <Image
                source={{ uri: v.image }}
                style={s.vendorImage}
              />
              <View style={s.cardPad}>
                <View style={s.row}>
                  <Text style={[s.cardTitle, { flex: 1 }]}>
                    {v.name}
                  </Text>
                  <Text style={s.rating}>★ {v.rating}</Text>
                </View>
                <Text style={s.sub}>
                  {v.area} · {v.eta}
                </Text>
                <Text style={s.bodySmall}>{v.description}</Text>
                <Text style={s.link}>View vendor ›</Text>
              </View>
            </Pressable>
          ))
        )}

        {/* Featured dishes */}
        <Heading
          title="Featured Menu Selection"
          subtitle="Order directly for instant pickup or door delivery"
        />

        {dishes.map(d => (
          <View key={d.name} style={s.dishCard}>
            <Image
              source={{ uri: d.image }}
              style={s.dishImage}
            />
            <View style={s.cardPad}>
              <Text style={s.cardTitle}>{d.name}</Text>
              <Text style={s.bodySmall}>{d.description}</Text>
              <View style={s.row}>
                <Text style={s.price}>{cash(d.price)}</Text>
                <Pressable
                  style={s.add}
                  onPress={() => openDish(d)}
                >
                  <Text style={{ color: C.white, fontSize: 24 }}>+</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}

        {/* Delivery tracking */}
        <Heading
          title="Active Food Dispatch"
          subtitle="Track your delivery rider in real time"
        />

        <View style={s.shipment}>
          <View style={s.row}>
            <Text style={s.live}>● RIDER EN ROUTE</Text>
            <Text style={s.sub}>Order #TK-8842</Text>
          </View>

          <View style={s.timeline}>
            {['Ordered', 'Preparing', 'On the Way', 'Delivered'].map(
              (v, i) => (
                <View
                  key={v}
                  style={{ alignItems: 'center', flex: 1 }}
                >
                  <View
                    style={[
                      s.timelineDot,
                      i < 2 && s.done,
                      i === 2 && s.current,
                    ]}
                  >
                    <Text
                      style={{
                        color: i < 2 ? C.white : C.darkGreen,
                      }}
                    >
                      {i < 2 ? '✓' : i === 2 ? '•' : '·'}
                    </Text>
                  </View>
                  <Text
                    style={[
                      s.timelineText,
                      i === 2 && {
                        color: C.darkGreen,
                        fontWeight: '900',
                      },
                    ]}
                  >
                    {v}
                  </Text>
                </View>
              ),
            )}
          </View>

          <View style={s.driver}>
            <Image
              source={{
                uri: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=80',
              }}
              style={s.avatar}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Sani Ibrahim</Text>
              <Text style={s.sub}>
                Logistics Dispatch Rider · Honda Ace
              </Text>
            </View>
            <Pressable
              style={s.call}
              onPress={() =>
                Alert.alert(
                  'Call rider',
                  'Calling Sani Ibrahim (+234-800-KAPITA)...',
                )
              }
            >
              <Text style={{ color: C.darkGreen }}>☎</Text>
            </Pressable>
          </View>

          <View style={s.pin}>
            <Text style={s.sub}>Give Delivery PIN to Rider:</Text>
            <Text style={s.price}>5924</Text>
          </View>
        </View>

        <Button
          title="Reserve a Table"
          onPress={() => show('reservation')}
          style={{ marginTop: 18 }}
        />

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Reservation modal */}
      <Sheet
        visible={modal === 'reservation'}
        title="Reserve a Table"
        subtitle="Book dining spots ahead at your favorite restaurant or buka."
        close={() => setModal('')}
      >
        <Text style={s.label}>RESTAURANT / BUKA</Text>

        {vendors.map(v => (
          <Pressable
            key={v.name}
            onPress={() => setRestaurant(v.name)}
            style={[
              s.option,
              restaurant === v.name && s.optionActive,
            ]}
          >
            <Text style={s.body}>{v.name}</Text>
            <Text style={s.sub}>{v.area}</Text>
          </Pressable>
        ))}

        <Text style={s.label}>DATE (YYYY-MM-DD)</Text>
        <TextInput
          value={date}
          onChangeText={setDate}
          style={s.input}
        />

        <Text style={s.label}>TIME (HH:MM)</Text>
        <TextInput
          value={time}
          onChangeText={setTime}
          style={s.input}
        />

        <Text style={s.label}>NUMBER OF GUESTS</Text>
        <TextInput
          value={guests}
          onChangeText={setGuests}
          keyboardType="number-pad"
          style={s.input}
        />

        <View style={s.summary}>
          <Text style={s.body}>Reservation Deposit: Free</Text>
          <Text style={s.greenText}>Instant Confirmation: Active</Text>
        </View>

        <Button
          title="Confirm Table Booking"
          onPress={reserve}
        />
      </Sheet>

      {/* Reservations list */}
      <Sheet
        visible={modal === 'reservations'}
        title="My Table Reservations"
        subtitle="View and manage your active restaurant bookings."
        close={() => setModal('')}
      >
        <View style={s.empty}>
          <Text style={s.h2}>No active reservations</Text>
          <Text style={s.sub}>Your table bookings will appear here.</Text>
        </View>
        <Button
          title="Make a Reservation"
          onPress={() => setModal('reservation')}
        />
      </Sheet>

      {/* Vendor registration */}
      <Sheet
        visible={modal === 'vendor'}
        title="Join as a Food Vendor"
        subtitle="Grow your restaurant or buka with theKapita Escrow & Logistics."
        close={() => setModal('')}
      >
        <Text style={s.label}>BUSINESS / RESTAURANT NAME</Text>
        <TextInput
          value={vendorName}
          onChangeText={setVendorName}
          style={s.input}
          placeholder="e.g. Iya Basira Local Buka"
        />

        <Text style={s.label}>ESTABLISHMENT TYPE</Text>
        {[
          'Authentic Local Buka',
          'Fine Dining Restaurant',
          'Grills & Suya Spot',
          'Bakery & Pastries',
        ].map(v => (
          <Pressable
            key={v}
            onPress={() => setVendorType(v)}
            style={[
              s.option,
              vendorType === v && s.optionActive,
            ]}
          >
            <Text style={s.body}>{v}</Text>
          </Pressable>
        ))}

        <Text style={s.label}>KITCHEN / STORE ADDRESS</Text>
        <TextInput
          value={vendorAddress}
          onChangeText={setVendorAddress}
          style={s.input}
          placeholder="Business address"
        />

        <Text style={s.label}>WHATSAPP / CONTACT PHONE</Text>
        <TextInput
          value={vendorPhone}
          onChangeText={setVendorPhone}
          keyboardType="phone-pad"
          style={s.input}
          placeholder="08000000000"
        />

        <Button
          title="Submit Vendor Application"
          onPress={applyVendor}
        />
      </Sheet>

      {/* Taste-Test Roulette */}
      <Sheet
        visible={modal === 'roulette'}
        title="Taste-Test Roulette"
        subtitle="Spin for a surprise meal and a 5% discount."
        close={() => setModal('')}
      >
        <Text style={s.label}>MAX BUDGET (₦)</Text>
        <TextInput
          value={budget}
          onChangeText={setBudget}
          keyboardType="number-pad"
          style={s.input}
        />

        <Text style={s.label}>CRAVING PREFERENCE</Text>
        {[
          'Surprise Me With Anything',
          'Spicy Local Swallows',
          'Grills & Suya',
          'Pastries & Sweet Treats',
        ].map(v => (
          <Pressable
            key={v}
            onPress={() => setPreference(v)}
            style={[
              s.option,
              preference === v && s.optionActive,
            ]}
          >
            <Text style={s.body}>{v}</Text>
          </Pressable>
        ))}

        {roulette && (
          <View style={s.summary}>
            <Text style={s.cardTitle}>{roulette.name}</Text>
            <Text style={s.sub}>{roulette.description}</Text>
            <Text style={s.price}>{cash(roulette.price)}</Text>
            <Button
              title="Claim & Order This Dish"
              onPress={() => openDish(roulette)}
            />
          </View>
        )}

        <Button title="Spin the Wheel!" onPress={spin} />
      </Sheet>

      {/* Taste-Buddy Split */}
      <Sheet
        visible={modal === 'buddy'}
        title="Taste-Buddy Split"
        subtitle="Pair your order with a nearby neighbour and split dispatch fees."
        close={() => setModal('')}
      >
        <View style={s.summary}>
          <Text style={s.cardTitle}>Live Neighborhood Matcher</Text>
          <Text style={s.sub}>
            We found Chidi O. ordering from Iya Basira Local Buka,
            400m away from your drop-off address.
          </Text>
          <Text style={s.greenText}>
            Potential Delivery Saving: ₦250 refunded to escrow wallet
          </Text>
        </View>

        <Button
          title="Pair Order & Split Dispatch Fee"
          onPress={() => {
            setModal('');
            Alert.alert(
              'Pairing requested',
              'Taste-Buddy pairing is a demo action.',
            );
          }}
        />
      </Sheet>

      {/* Escrow order history */}
      <Sheet
        visible={modal === 'history'}
        title="Escrow Order History"
        subtitle="Your recent orders and reorder history."
        close={() => setModal('')}
      >
        <View style={s.summary}>
          <View style={s.row}>
            <Text style={s.cardTitle}>Iya Basira Local Buka</Text>
            <Text style={s.price}>₦3,800.00</Text>
          </View>
          <Text style={s.sub}>
            Abula Combo · Delivered Oct 6, 2026
          </Text>
          <Button
            title="Reorder Dish"
            secondary
            onPress={() => openDish(dishes[1])}
          />
        </View>
      </Sheet>

      {/* Dish checkout */}
      <Sheet
        visible={modal === 'dish'}
        title={dish.vendor}
        subtitle="Escrow Protected Checkout"
        close={() => setModal('')}
      >
        <Image
          source={{ uri: dish.image }}
          style={s.modalDishImage}
        />

        <Text style={s.cardTitle}>{dish.name}</Text>
        <Text style={s.modalPrice}>{cash(dish.price * qty)}</Text>

        <View style={s.row}>
          <View style={s.quantity}>
            <Pressable
              onPress={() => setQty(v => Math.max(1, v - 1))}
              style={s.qtyBtn}
            >
              <Text style={s.body}>−</Text>
            </Pressable>

            <Text style={s.cardTitle}>{qty}</Text>

            <Pressable
              onPress={() => setQty(v => v + 1)}
              style={s.qtyBtn}
            >
              <Text style={s.body}>+</Text>
            </Pressable>
          </View>

          <Button
            title="Add to Escrow Order"
            onPress={() => {
              setModal('');
              Alert.alert(
                'Added to escrow order',
                `${qty} × ${dish.name} (${cash(dish.price * qty)})`,
              );
            }}
            style={{ flex: 1, marginLeft: 10 }}
          />
        </View>
      </Sheet>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.white },
  header: { minHeight: 58, paddingHorizontal: 13, flexDirection: 'row',
     alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.border,
      backgroundColor: C.white, zIndex: 5, },
  headerContainer:{flexDirection:"row",height:"13%",alignItems:"flex-end"},
  back: { width: 34, height: 34, borderRadius: 18, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 30, lineHeight: 32, color: C.ink, marginTop: -4 },
  brand: { fontSize: 19, fontWeight: '900', color: C.ink },
  brandSub: { fontSize: 10, color: C.muted, fontWeight: '700', marginTop: -3 },
  locationPill: { maxWidth: 145, minHeight: 34, borderRadius: 18, backgroundColor: C.surface, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 3 },
  locationText: { fontSize: 10, color: C.ink, fontWeight: '700', flexShrink: 1 },
  account: { marginLeft: 6, padding: 9, borderRadius: 18, backgroundColor: C.surface },
  dropdown: { position: 'absolute', right: 12, top: 62, width: 245, backgroundColor: C.white, borderRadius: 14, padding: 10, zIndex: 20, elevation: 8 },
  balance: { backgroundColor: C.pale, padding: 12, borderRadius: 10, marginBottom: 6 },
  balanceValue: { fontSize: 19, fontWeight: '900', color: C.darkGreen },
  dropItem: { paddingVertical: 11, borderBottomWidth: 1, borderColor: C.border },
  content: { padding: 15, paddingBottom: 36 },
  modeRow: { flexDirection: 'row', padding: 4, backgroundColor: C.surface, borderRadius: 13, marginBottom: 14 },
  modeBtn: { flex: 1, minHeight: 42, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modeActive: { backgroundColor: C.green },
  modeText: { fontSize: 10, fontWeight: '800', color: C.muted, textAlign: 'center' },
  ai: { backgroundColor: '#F0FBF6', borderColor: '#D2F0E2', borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 15 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  aiTitle: { color: C.darkGreen, fontWeight: '900', fontSize: 12 },
  aiBody: { backgroundColor: C.white, borderRadius: 10, padding: 12, marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  body: { color: C.ink, fontSize: 12, lineHeight: 18 },
  price: { color: C.darkGreen, fontWeight: '900', fontSize: 15 },
  locationCard: { padding: 13, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, marginBottom: 13 },
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6, color: C.muted, marginTop: 10, marginBottom: 6 },
  input: { minHeight: 43, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, color: C.ink, fontSize: 13, marginBottom: 4 },
  chips: { flexDirection: 'row', gap: 8, paddingBottom: 15 },
  chip: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.white },
  chipActive: { backgroundColor: C.pale, borderColor: C.green },
  chipText: { color: C.muted, fontSize: 11, fontWeight: '800' },
  vendorBanner: { backgroundColor: '#101828', borderRadius: 14, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 22 },
  vendorTitle: { color: C.white, fontSize: 14, fontWeight: '900' },
  vendorSub: { color: '#D0D5DD', fontSize: 11, marginTop: 4 },
  partner: { color: '#A6F4C5', fontSize: 10, fontWeight: '900', backgroundColor: '#174D3C', padding: 8, borderRadius: 18 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, marginBottom: 12 },
  h2: { fontSize: 17, fontWeight: '900', color: C.ink, letterSpacing: -0.3 },
  sub: { fontSize: 11, color: C.muted, lineHeight: 16, marginTop: 3 },
  count: { fontSize: 10, fontWeight: '900', color: C.darkGreen, backgroundColor: C.pale, padding: 7, borderRadius: 18 },
  vendorCard: { borderRadius: 14, overflow: 'hidden', backgroundColor: C.white, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  vendorImage: { width: '100%', height: 135, backgroundColor: C.surface },
  cardPad: { padding: 12 },
  cardTitle: { fontSize: 14, fontWeight: '900', color: C.ink },
  rating: { fontSize: 11, color: C.orange, fontWeight: '900' },
  bodySmall: { fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 16 },
  link: { fontSize: 11, color: C.darkGreen, fontWeight: '900', marginTop: 9 },
  dishCard: { borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 12 },
  dishImage: { width: '100%', height: 150, backgroundColor: C.surface },
  add: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  shipment: { borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14 },
  live: { fontSize: 10, fontWeight: '900', color: C.darkGreen, backgroundColor: C.pale, padding: 7, borderRadius: 18, overflow: 'hidden' },
  timeline: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 20 },
  timelineDot: { width: 27, height: 27, borderRadius: 14, backgroundColor: '#F2F4F7', borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  done: { backgroundColor: C.green, borderColor: C.green },
  current: { backgroundColor: C.pale, borderColor: C.green, borderWidth: 2 },
  timelineText: { fontSize: 9, color: C.muted, marginTop: 6, textAlign: 'center' },
  driver: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderColor: C.border },
  avatar: { width: 43, height: 43, borderRadius: 22 },
  call: { width: 38, height: 38, borderRadius: 20, backgroundColor: C.pale, alignItems: 'center', justifyContent: 'center' },
  pin: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 11, borderRadius: 10, backgroundColor: C.surface },
  button: { minHeight: 46, borderRadius: 11, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 11, marginTop: 12 },
  buttonText: { color: C.white, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  buttonSecondary: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  buttonSecondaryText: { color: C.ink },
  overlay: { flex: 1, backgroundColor: 'rgba(16,24,40,.52)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', backgroundColor: C.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  sheetTitle: { fontSize: 19, fontWeight: '900', color: C.ink },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  option: { padding: 10, borderWidth: 1, borderColor: C.border, borderRadius: 9, marginBottom: 6 },
  optionActive: { borderColor: C.green, backgroundColor: C.pale },
  summary: { backgroundColor: C.surface, borderRadius: 11, padding: 12, marginTop: 12, marginBottom: 4 },
  greenText: { fontSize: 12, color: C.darkGreen, fontWeight: '900', marginTop: 5 },
  empty: { padding: 22, backgroundColor: C.surface, borderRadius: 12, alignItems: 'center', marginVertical: 14 },
  modalDishImage: { width: '100%', height: 160, borderRadius: 12, marginBottom: 12 },
  modalPrice: { fontSize: 21, fontWeight: '900', color: C.darkGreen, marginVertical: 8 },
  quantity: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, overflow: 'hidden' },
  qtyBtn: { width: 38, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
});
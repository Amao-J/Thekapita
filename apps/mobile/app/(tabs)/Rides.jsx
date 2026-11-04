// import React from "react";
// import { Text,View } from "react-native";

// export default function Rides(){
// return (<View>
// <Text>rides</Text>
// </View>)
// }

import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * theKapita Ride & Courier
 * Native Expo conversion of the supplied ride.html.
 *
 * Place in: apps/mobile/app/(tabs)/ride.js
 * Connect booking, contacts, wallet, dispatch, GPS, calling
 * and live tracking to your API.
 */

const GREEN = '#008a57';
const DARK = '#121a17';
const MUTED = '#748078';
const BORDER = '#e5ebe7';
const BG = '#f5f8f6';

const RIDE_OPTIONS = [
  { name: 'Kapita Go', passengers: 4, description: 'Affordable compact everyday rides', eta: '3 mins away', price: 2200, arrival: '11:42 AM', icon: '' },
  { name: 'Kapita Comfort', passengers: 4, description: 'Top-rated drivers & newer spacious cars', eta: '5 mins away', price: 3500, arrival: '11:44 AM', icon: '' },
  { name: 'Kapita Keke Express', passengers: 3, description: 'Fast traffic-beating local commutes', eta: '1 min away', price: 1200, arrival: '11:40 AM', icon: '' },
  { name: 'Kapita Executive', passengers: 4, description: 'Luxury SUVs for business meetings', eta: '8 mins away', price: 6500, arrival: '11:47 AM', icon: '' },
];

const PACKAGES = [
  { name: 'Envelope & Doc', detail: 'Up to 1kg', price: 1500, category: 'Document / Envelope', icon: '' },
  { name: 'Standard Box', detail: '1kg - 10kg', price: 2500, category: 'Small Box / Bag', icon: '' },
  { name: 'Cargo / Van', detail: '10kg - 500kg', price: 8500, category: 'Bulk Freight / Van', icon: '' },
];

const CONTACTS = [
  { name: 'Sarah Okafor', email: 'sarah@example.com', initials: 'SO' },
  { name: 'David Oloyede', email: 'david@example.com', initials: 'DO' },
];

const money = (amount) => `₦${Number(amount).toLocaleString('en-NG')}`;

function AppButton({ title, onPress, secondary = false, disabled = false, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>
        {title}
      </Text>
    </Pressable>
  );
}

function SectionHeading({ title, subtitle }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!!subtitle && (
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      )}
    </View>
  );
}

function Field({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType,
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9aa69f"
      multiline={multiline}
      keyboardType={keyboardType}
      style={[styles.field, multiline && styles.multilineField]}
    />
  );
}

export default function Rides() {
  const [service, setService] = useState('ride');
  const [pickup, setPickup] = useState(
    'Current Location (Victoria Island, Lagos)'
  );
  const [destination, setDestination] = useState('');
  const [selectedRide, setSelectedRide] = useState(0);

  const [parcelPickup, setParcelPickup] = useState(
    '12 Lekki Phase 1, Lagos'
  );
  const [parcelDropoff, setParcelDropoff] = useState('');
  const [selectedPackage, setSelectedPackage] = useState(0);
  const [speed, setSpeed] = useState('standard');

  const [splitVisible, setSplitVisible] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [menuVisible, setMenuVisible] = useState(false);
  const [networkOffline, setNetworkOffline] = useState(false);

  const ride = RIDE_OPTIONS[selectedRide];
  const packageOption = PACKAGES[selectedPackage];

  const parcelTotal =
    packageOption.price + (speed === 'express' ? 1000 : 0);

  const filteredContacts = useMemo(
    () =>
      CONTACTS.filter((c) =>
        `${c.name} ${c.email}`
          .toLowerCase()
          .includes(contactSearch.toLowerCase())
      ),
    [contactSearch]
  );

  const yourShare = selectedContacts.length
    ? Math.ceil(ride.price / (selectedContacts.length + 1))
    : ride.price;

  const requestRide = () => {
    if (!pickup.trim() || !destination.trim()) {
      Alert.alert(
        'Missing location',
        'Enter both pickup and destination locations.'
      );
      return;
    }

    Alert.alert(
      'Ride request',
      `Your ${ride.name} request is ready. Connect this action to the ride-booking API.`
    );
  };

  const requestDispatch = () => {
    if (!parcelPickup.trim() || !parcelDropoff.trim()) {
      Alert.alert(
        'Missing address',
        'Enter both pickup and receiver addresses.'
      );
      return;
    }

    Alert.alert(
      'Courier dispatch',
      `${packageOption.category} • ${money(parcelTotal)}. Connect this action to the dispatch API.`
    );
  };

  const toggleContact = (name) => {
    setSelectedContacts((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : current.length < 3
          ? [...current, name]
          : current
    );
  };

  const switchService = (next) => {
    setService(next);
    setMenuVisible(false);
  };

  return (
   <SafeAreaView style={styles.safe} edges={[]}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <View style={styles.header}>
        <View style={styles.headerInnerContainer}>
            <Pressable
            onPress={() =>
                Alert.alert(
                'Navigation',
                'Connect this to your app home route.'
                )
            }
            style={styles.headerBack}
            >
            <Text style={styles.backGlyph}>‹</Text>
            </Pressable>

            <View style={styles.headerBrand}>
            <Text style={styles.brand}>theKapita</Text>
            <Text style={styles.brandAccent}>Ride & Courier</Text>
            </View>

            <Pressable
            onPress={() => setMenuVisible(true)}
            style={styles.menuButton}
            >
            <Text style={styles.menuGlyph}>☰</Text>
            </Pressable>
        </View>
      </View>
            {networkOffline && (
        <View style={styles.networkBanner}>
          <Text style={styles.networkText}>
            No network connection. Some features may be unavailable.
          </Text>
          <Pressable onPress={() => setNetworkOffline(false)}>
            <Text style={styles.dismiss}>×</Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topNav}>
          {[
            { id: 'ride', label: '  Book Ride' },
            { id: 'logistics', label: '  Logistics' },
            { id: 'tracking', label: '  Tracking' },
          ].map((item) => (
            <Pressable
              key={item.id}
              onPress={() => switchService(item.id)}
              style={[
                styles.topNavItem,
                service === item.id && styles.topNavActive,
              ]}
            >
              <Text
                style={[
                  styles.topNavText,
                  service === item.id && styles.topNavTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.modeToggle}>
          <Pressable
            onPress={() => switchService('ride')}
            style={[
              styles.modeButton,
              service === 'ride' && styles.modeButtonActive,
            ]}
          >
            <Text
              style={[
                styles.modeText,
                service === 'ride' && styles.modeTextActive,
              ]}
            >
                Ride Hailing
            </Text>
          </Pressable>

          <Pressable
            onPress={() => switchService('logistics')}
            style={[
              styles.modeButton,
              service === 'logistics' && styles.modeButtonActive,
            ]}
          >
            <Text
              style={[
                styles.modeText,
                service === 'logistics' && styles.modeTextActive,
              ]}
            >
                Parcel & Courier
            </Text>
          </Pressable>
        </View>

        {service !== 'tracking' && (
          <View style={styles.aiBanner}>
            <Text style={styles.aiIcon}>✦</Text>
            <View style={styles.aiCopy}>
              <Text style={styles.aiTitle}>
                Kapita AI Delivery Predictor
              </Text>
              <Text style={styles.aiText}>
                Low traffic on Third Mainland Bridge. Express courier
                dispatch is estimated to arrive in ~28 mins.
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setService('logistics');
                setSpeed('express');
              }}
            >
              <Text style={styles.aiAction}>Priority dispatch</Text>
            </Pressable>
          </View>
        )}

        {service === 'ride' && (
          <>
            <SectionHeading
              title="Where would you like to go?"
              subtitle="Enter your pickup and destination."
            />

            <View style={styles.locationCard}>
              <View style={styles.routeRail}>
                <View style={styles.originDot} />
                <View style={styles.routeLine} />
                <View style={styles.destinationDot} />
              </View>

              <View style={styles.locationFields}>
                <View style={styles.inputWithIcon}>
                  <Text style={styles.fieldIcon}>◎</Text>
                  <View style={styles.flex}>
                    <Field
                      value={pickup}
                      onChangeText={setPickup}
                      placeholder="Pickup Location"
                    />
                  </View>
                </View>

                <View style={styles.inputWithIcon}>
                  <Text style={styles.fieldIcon}>⌖</Text>
                  <View style={styles.flex}>
                    <Field
                      value={destination}
                      onChangeText={setDestination}
                      placeholder="Where are you going?"
                    />
                  </View>
                </View>
              </View>

              <Pressable
                style={styles.swapButton}
                onPress={() => {
                  setPickup(destination);
                  setDestination(pickup);
                }}
                accessibilityLabel="Swap pickup and destination"
              >
                <Text style={styles.swapGlyph}>⇅</Text>
              </Pressable>
            </View>

            <Pressable
              style={styles.splitBanner}
              onPress={() => setSplitVisible(true)}
            >
              <View style={styles.splitIcon}>
                <Text style={styles.splitIconText}>2</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.splitTitle}>
                  Split Fare & Pool Trip
                </Text>
                <Text style={styles.splitDescription}>
                  Share ride cost automatically with up to 3 nearby
                  Kapita users
                </Text>
              </View>
              <Text style={styles.saveBadge}>SAVE 40%</Text>
            </Pressable>

            <SectionHeading
              title="Choose your ride"
              subtitle="Select the vehicle that works best for you."
            />

            {RIDE_OPTIONS.map((item, index) => (
              <Pressable
                key={item.name}
                onPress={() => setSelectedRide(index)}
                style={[
                  styles.optionCard,
                  selectedRide === index && styles.optionSelected,
                ]}
              >
                <View style={styles.vehicleIcon}>
                  <Text style={styles.vehicleEmoji}>{item.icon}</Text>
                </View>

                <View style={styles.optionInfo}>
                  <Text style={styles.optionName}>
                    {item.name}
                    <Text style={styles.passengers}>
                      {' '}· {item.passengers} seats
                    </Text>
                  </Text>
                  <Text style={styles.optionDescription}>
                    {item.description}
                  </Text>
                  <Text style={styles.optionEta}>{item.eta}</Text>
                </View>

                <View style={styles.optionPrice}>
                  <Text style={styles.price}>{money(item.price)}</Text>
                  <Text style={styles.arrival}>{item.arrival}</Text>
                  <View
                    style={[
                      styles.radio,
                      selectedRide === index && styles.radioSelected,
                    ]}
                  >
                    {selectedRide === index && (
                      <View style={styles.radioInner} />
                    )}
                  </View>
                </View>
              </Pressable>
            ))}

            <AppButton
              title={`Request ${ride.name}  •  ${money(ride.price)}`}
              onPress={requestRide}
              style={styles.primaryAction}
            />
          </>
        )}
                {service === 'logistics' && (
          <>
            <SectionHeading
              title="Parcel Booking & Dispatch"
              subtitle="Instant bike, van and freight courier delivery across the city."
            />

            <View style={styles.locationCard}>
              <View style={styles.routeRail}>
                <View style={styles.originDot} />
                <View style={styles.routeLine} />
                <View style={styles.destinationDot} />
              </View>

              <View style={styles.locationFields}>
                <View style={styles.inputWithIcon}>
                  <Text style={styles.fieldIcon}>↑</Text>
                  <View style={styles.flex}>
                    <Field
                      value={parcelPickup}
                      onChangeText={setParcelPickup}
                      placeholder="Pickup address & sender phone"
                    />
                  </View>
                </View>

                <View style={styles.inputWithIcon}>
                  <Text style={styles.fieldIcon}>↓</Text>
                  <View style={styles.flex}>
                    <Field
                      value={parcelDropoff}
                      onChangeText={setParcelDropoff}
                      placeholder="Receiver destination & phone"
                    />
                  </View>
                </View>
              </View>
            </View>

            <SectionHeading title="Select package type & weight" />

            <View style={styles.packageGrid}>
              {PACKAGES.map((item, index) => (
                <Pressable
                  key={item.name}
                  onPress={() => setSelectedPackage(index)}
                  style={[
                    styles.packageCard,
                    selectedPackage === index && styles.optionSelected,
                  ]}
                >
                  <Text style={styles.packageEmoji}>{item.icon}</Text>
                  <Text style={styles.packageName}>{item.name}</Text>
                  <Text style={styles.packageDetail}>{item.detail}</Text>
                  <Text style={styles.packagePrice}>
                    {money(item.price)}
                  </Text>
                  <View
                    style={[
                      styles.radio,
                      selectedPackage === index && styles.radioSelected,
                    ]}
                  >
                    {selectedPackage === index && (
                      <View style={styles.radioInner} />
                    )}
                  </View>
                </Pressable>
              ))}
            </View>

            <SectionHeading title="Delivery speed" />

            <Pressable
              onPress={() => setSpeed('standard')}
              style={[
                styles.speedCard,
                speed === 'standard' && styles.optionSelected,
              ]}
            >
              <View
                style={[
                  styles.radio,
                  speed === 'standard' && styles.radioSelected,
                ]}
              >
                {speed === 'standard' && (
                  <View style={styles.radioInner} />
                )}
              </View>
              <View style={styles.flex}>
                <Text style={styles.speedTitle}>Standard Delivery</Text>
                <Text style={styles.speedDetail}>
                  Same-day dispatch within 3 hours
                </Text>
              </View>
              <Text style={styles.speedBadge}>REGULAR</Text>
            </Pressable>

            <Pressable
              onPress={() => setSpeed('express')}
              style={[
                styles.speedCard,
                speed === 'express' && styles.optionSelected,
              ]}
            >
              <View
                style={[
                  styles.radio,
                  speed === 'express' && styles.radioSelected,
                ]}
              >
                {speed === 'express' && (
                  <View style={styles.radioInner} />
                )}
              </View>
              <View style={styles.flex}>
                <Text style={styles.speedTitle}>
                  Express Priority (+₦1,000)
                </Text>
                <Text style={styles.speedDetail}>
                  Direct door-to-door dispatch under 45 mins
                </Text>
              </View>
              <Text style={[styles.speedBadge, styles.expressBadge]}>
                FASTEST
              </Text>
            </Pressable>

            <View style={styles.vendorCard}>
              <Text style={styles.vendorIcon}>🏪</Text>
              <View style={styles.flex}>
                <Text style={styles.vendorTitle}>
                  Are you an E-commerce Vendor?
                </Text>
                <Text style={styles.vendorText}>
                  Get up to 30% discount with a Kapita Business Courier
                  Account.
                </Text>
              </View>
              <AppButton
                title="Learn more"
                secondary
                onPress={() =>
                  Alert.alert(
                    'Business courier',
                    'Connect this to the Kapita Business Vendor Portal.'
                  )
                }
              />
            </View>

            <AppButton
              title={`Dispatch Courier  •  ${money(parcelTotal)}`}
              onPress={requestDispatch}
              style={styles.primaryAction}
            />
          </>
        )}

        {service === 'tracking' && (
          <>
            <SectionHeading
              title="Real-Time Shipment & Courier Radar"
              subtitle="Live GPS tracking and proof-of-delivery confirmation."
            />

            <View style={styles.trackingCard}>
              <View style={styles.trackingHeader}>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE IN TRANSIT</Text>
                </View>
                <Text style={styles.trackingCode}>
                  Waybill #KPT-LOG-99201
                </Text>
              </View>

              <View style={styles.timeline}>
                <View style={styles.timelineStep}>
                  <View style={styles.timelineCircleDone}>
                    <Text style={styles.timelineCheck}>✓</Text>
                  </View>
                  <Text style={styles.timelineLabel}>Picked Up</Text>
                </View>

                <View style={styles.timelineConnectorActive} />

                <View style={styles.timelineStep}>
                  <View style={styles.timelineCircleActive}>
                    <Text style={styles.timelineTruck}>↗</Text>
                  </View>
                  <Text style={styles.timelineLabelActive}>
                    On The Way
                  </Text>
                </View>

                <View style={styles.timelineConnector} />

                <View style={styles.timelineStep}>
                  <View style={styles.timelineCircle}>
                    <Text>⌂</Text>
                  </View>
                  <Text style={styles.timelineLabel}>Delivered</Text>
                </View>
              </View>

              <View style={styles.driverCard}>
                <View style={styles.driverAvatar}>
                  <Text style={styles.driverInitials}>MI</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.driverName}>
                    Musa Ibrahim{' '}
                    <Text style={styles.rating}>★ 4.9</Text>
                  </Text>
                  <Text style={styles.driverMeta}>
                    Honda Rider • Bike License: KJA-881-QB
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      'Call courier',
                      'Connect this button to your phone-call workflow.'
                    )
                  }
                  style={styles.callButton}
                >
                  <Text style={styles.callGlyph}>☎</Text>
                </Pressable>
              </View>

              <View style={styles.otpCard}>
                <Text style={styles.otpIcon}>✓</Text>
                <View style={styles.flex}>
                  <Text style={styles.otpTitle}>
                    Digital OTP Verification Required
                  </Text>
                  <Text style={styles.otpDescription}>
                    Share this 4-digit code with the rider upon arrival:
                  </Text>
                  <Text style={styles.otpCode}>8842</Text>
                </View>
              </View>

              <Text style={styles.demoNote}>
                Demo tracking information from the supplied HTML. Replace
                with live shipment data from your backend.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
      <Modal
        visible={splitVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSplitVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSplitVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View style={styles.flex}>
                <Text style={styles.modalTitle}>
                  Split Fare with Contacts
                </Text>
                <Text style={styles.modalSubtitle}>
                  Request split payment from your co-riders.
                </Text>
              </View>
              <Pressable onPress={() => setSplitVisible(false)}>
                <Text style={styles.closeGlyph}>×</Text>
              </Pressable>
            </View>

            <TextInput
              value={contactSearch}
              onChangeText={setContactSearch}
              placeholder="Search contact or phone number"
              placeholderTextColor="#9aa69f"
              style={styles.field}
            />

            <Text style={styles.contactHint}>Select up to 3 contacts</Text>

            {filteredContacts.map((contact) => {
              const selected = selectedContacts.includes(contact.name);

              return (
                <Pressable
                  key={contact.name}
                  onPress={() => toggleContact(contact.name)}
                  style={styles.contactRow}
                >
                  <View style={styles.contactAvatar}>
                    <Text style={styles.contactInitials}>
                      {contact.initials}
                    </Text>
                  </View>

                  <View style={styles.flex}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    <Text style={styles.contactEmail}>{contact.email}</Text>
                  </View>

                  <Text
                    style={[
                      styles.addContact,
                      selected && styles.addedContact,
                    ]}
                  >
                    {selected ? 'Added ✓' : 'Add +'}
                  </Text>
                </Pressable>
              );
            })}

            <View style={styles.fareSummary}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total trip fare</Text>
                <Text style={styles.summaryValue}>
                  {money(ride.price)}
                </Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  Your estimated share
                </Text>
                <Text style={styles.shareValue}>
                  {money(yourShare)}
                </Text>
              </View>
            </View>

            <AppButton
              title="Send Split Request & Confirm"
              onPress={() => {
                setSplitVisible(false);
                Alert.alert(
                  'Split request',
                  'Connect this action to your contacts and payment API.'
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setMenuVisible(false)}
        >
          <Pressable style={styles.menuSheet} onPress={() => {}}>
            <Text style={styles.menuSheetTitle}>
              theKapita services
            </Text>

            <View style={styles.walletBalance}>
              <Text style={styles.balanceLabel}>
                Available Wallet Balance
              </Text>
              <Text style={styles.balanceAmount}>₦245,500.00</Text>
            </View>

            <Pressable
              style={styles.menuRow}
              onPress={() => switchService('ride')}
            >
              <Text style={styles.menuRowText}>
                🚕  Book a Taxi Ride
              </Text>
            </Pressable>

            <Pressable
              style={styles.menuRow}
              onPress={() => switchService('logistics')}
            >
              <Text style={styles.menuRowText}>
                📦  Send Package / Delivery
              </Text>
            </Pressable>

            <Pressable
              style={styles.menuRow}
              onPress={() => switchService('tracking')}
            >
              <Text style={styles.menuRowText}>
                📍  Track Active Shipments
              </Text>
            </Pressable>

            <Pressable
              style={styles.menuRow}
              onPress={() => {
                setMenuVisible(false);
                Alert.alert(
                  'Wallet',
                  'Navigate to your Kapita Pay wallet route here.'
                );
              }}
            >
              <Text style={styles.menuRowText}>
                💳  Kapita Pay Wallet
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
    // marginBottom:"0%"
  },
  header: {
    minHeight: 62,
    height:"13%",
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    // marginTop:50
  },
  headerInnerContainer:{
    flexDirection:"row",
    marginBottom:"2.5%",
    // borderWidth:1,
    // borderColor:"green",
    alignItems:"center"
  },
  headerBack: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f0f4f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: {
    fontSize: 30,
    color: DARK,
    lineHeight: 32,
    marginTop: -3,
  },
  headerBrand: {
    flex: 1,
    marginLeft: 10,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  brand: {
    color: DARK,
    fontSize: 16,
    fontWeight: '800',
  },
  brandAccent: {
    color: GREEN,
    fontSize: 14,
    fontWeight: '700',
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f4f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuGlyph: {
    fontSize: 21,
    color: DARK,
  },
  networkBanner: {
    backgroundColor: '#fff1e8',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  networkText: {
    flex: 1,
    color: '#9b4b18',
    fontSize: 12,
  },
  dismiss: {
    color: '#9b4b18',
    fontSize: 22,
    paddingHorizontal: 5,
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  topNav: {
    flexDirection: 'row',
    backgroundColor: '#eaf0ec',
    padding: 4,
    borderRadius: 14,
    marginBottom: 14,
  },
  topNavItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 11,
  },
  topNavActive: {
    backgroundColor: '#fff',
    shadowColor: '#15251c',
    shadowOpacity: 0.07,
    shadowRadius: 5,
    elevation: 2,
  },
  topNavText: {
    fontSize: 11,
    color: '#68756d',
    fontWeight: '700',
  },
  topNavTextActive: {
    color: GREEN,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#eaf0ec',
    borderRadius: 13,
    padding: 4,
    marginBottom: 16,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#fff',
  },
  modeText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '700',
  },
  modeTextActive: {
    color: GREEN,
  },
  aiBanner: {
    // backgroundColor: '#eaf7f0',
    backgroundColor: '#000000',

    borderColor: '#ccebd9',
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 22,
  },
  aiIcon: {
    color: GREEN,
    fontSize: 24,
    fontWeight: '800',
  },
  aiCopy: {
    flex: 1,
  },
  aiTitle: {
    color: '#176b49',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 3,
  },
  aiText: {
    color: '#426b57',
    fontSize: 11,
    lineHeight: 16,
  },
  aiAction: {
    color: GREEN,
    fontSize: 11,
    fontWeight: '800',
  },
  sectionHeading: {
    marginTop: 8,
    marginBottom: 11,
  },
  sectionTitle: {
    color: DARK,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  locationCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  routeRail: {
    width: 20,
    alignItems: 'center',
    marginRight: 7,
    paddingVertical: 13,
  },
  originDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: GREEN,
  },
  routeLine: {
    width: 1,
    height: 34,
    backgroundColor: '#b7c6bc',
    marginVertical: 3,
  },
  destinationDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: GREEN,
    backgroundColor: '#fff',
  },
  locationFields: {
    flex: 1,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 51,
    borderBottomWidth: 1,
    borderBottomColor: '#edf1ee',
  },
  fieldIcon: {
    width: 24,
    color: GREEN,
    fontSize: 18,
    fontWeight: '700',
  },
  flex: {
    flex: 1,
  },
  field: {
    color: DARK,
    fontSize: 13,
    minHeight: 45,
    paddingHorizontal: 0,
    paddingVertical: 10,
  },
  multilineField: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  swapButton: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#edf6f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 5,
  },
  swapGlyph: {
    color: GREEN,
    fontSize: 21,
    fontWeight: '700',
  },
  splitBanner: {
    // backgroundColor: '#fff',

    backgroundColor: '#000000',

    borderRadius: 15,
    padding: 13,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 22,
  },
  splitIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#eaf7f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitIconText: {
    color: GREEN,
    fontSize: 24,
    fontWeight: '800',
  },
  splitTitle: {
    color: GREEN,
    fontSize: 13,
    fontWeight: '800',
  },
  splitDescription: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  saveBadge: {
    backgroundColor: '#e5f7ec',
    color: GREEN,
    overflow: 'hidden',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 5,
    fontSize: 9,
    fontWeight: '900',
  },
  optionCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },
  optionSelected: {
    borderColor: GREEN,
    backgroundColor: '#f3fbf6',
  },
  vehicleIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: '#edf6f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  vehicleEmoji: {
    fontSize: 24,
  },
  optionInfo: {
    flex: 1,
  },
  optionName: {
    color: DARK,
    fontSize: 13,
    fontWeight: '800',
  },
  passengers: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '500',
  },
  optionDescription: {
    color: MUTED,
    fontSize: 10,
    marginTop: 4,
    lineHeight: 14,
  },
  optionEta: {
    color: GREEN,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  optionPrice: {
    alignItems: 'flex-end',
    marginLeft: 7,
  },
  price: {
    color: DARK,
    fontSize: 14,
    fontWeight: '900',
  },
  arrival: {
    color: MUTED,
    fontSize: 10,
    marginTop: 4,
  },
  radio: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#bdc9c1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 7,
    alignSelf: 'flex-end',
  },
  radioSelected: {
    borderColor: GREEN,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: GREEN,
  },
  button: {
    backgroundColor: GREEN,
    borderRadius: 13,
    minHeight: 49,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#eaf5ee',
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 9,
  },
  secondaryButtonText: {
    color: GREEN,
    fontSize: 11,
  },
  disabledButton: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.82,
  },
  primaryAction: {
    marginTop: 12,
    marginBottom: 20,
  },
  packageGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  packageCard: {
    flex: 1,
    minHeight: 142,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    padding: 9,
    alignItems: 'center',
  },
  packageEmoji: {
    fontSize: 23,
    marginBottom: 7,
  },
  packageName: {
    color: DARK,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  packageDetail: {
    color: MUTED,
    fontSize: 10,
    marginTop: 5,
    textAlign: 'center',
  },
  packagePrice: {
    color: GREEN,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 8,
  },
  speedCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 9,
  },
  speedTitle: {
    color: DARK,
    fontSize: 12,
    fontWeight: '800',
  },
  speedDetail: {
    color: MUTED,
    fontSize: 10,
    marginTop: 4,
  },
  speedBadge: {
    color: '#637168',
    backgroundColor: '#edf1ee',
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 5,
  },
  expressBadge: {
    color: '#a65b11',
    backgroundColor: '#fff1dc',
  },
  vendorCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    marginTop: 12,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  vendorIcon: {
    fontSize: 25,
  },
  vendorTitle: {
    color: DARK,
    fontSize: 11,
    fontWeight: '800',
  },
  vendorText: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  trackingCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 14,
  },
  trackingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  liveBadge: {
    backgroundColor: '#e5f7ec',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: GREEN,
  },
  liveText: {
    color: GREEN,
    fontSize: 9,
    fontWeight: '900',
  },
  trackingCode: {
    color: MUTED,
    fontSize: 10,
    fontWeight: '700',
  },
  timeline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 28,
  },
  timelineStep: {
    alignItems: 'center',
    width: 72,
  },
  timelineCircleDone: {
    width: 31,
    height: 31,
    borderRadius: 16,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineCircleActive: {
    width: 31,
    height: 31,
    borderRadius: 16,
    backgroundColor: '#e6f5ed',
    borderWidth: 2,
    borderColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineCircle: {
    width: 31,
    height: 31,
    borderRadius: 16,
    backgroundColor: '#f0f3f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineCheck: {
    color: '#fff',
    fontWeight: '900',
  },
  timelineTruck: {
    color: GREEN,
    fontWeight: '900',
  },
  timelineLabel: {
    color: MUTED,
    fontSize: 10,
    marginTop: 7,
  },
  timelineLabelActive: {
    color: GREEN,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 7,
  },
  timelineConnectorActive: {
    flex: 1,
    height: 2,
    backgroundColor: GREEN,
    marginBottom: 17,
  },
  timelineConnector: {
    flex: 1,
    height: 2,
    backgroundColor: '#dce4df',
    marginBottom: 17,
  },
  driverCard: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e8f2ec',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverInitials: {
    color: GREEN,
    fontWeight: '900',
    fontSize: 15,
  },
  driverName: {
    color: DARK,
    fontSize: 13,
    fontWeight: '800',
  },
  rating: {
    color: '#d28b18',
    fontSize: 11,
  },
  driverMeta: {
    color: MUTED,
    fontSize: 10,
    marginTop: 4,
  },
  callButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#eaf7f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callGlyph: {
    color: GREEN,
    fontSize: 18,
  },
  otpCard: {
    backgroundColor: '#f1f8f3',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  otpIcon: {
    color: GREEN,
    fontSize: 21,
    fontWeight: '900',
  },
  otpTitle: {
    color: DARK,
    fontSize: 11,
    fontWeight: '800',
  },
  otpDescription: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  otpCode: {
    color: GREEN,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 4,
    marginTop: 5,
  },
  demoNote: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8,20,13,0.48)',
    justifyContent: 'flex-end',
    padding: 12,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 17,
    paddingBottom: 22,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 15,
  },
  modalTitle: {
    color: DARK,
    fontSize: 18,
    fontWeight: '900',
  },
  modalSubtitle: {
    color: MUTED,
    fontSize: 11,
    marginTop: 4,
  },
  closeGlyph: {
    color: MUTED,
    fontSize: 28,
    paddingHorizontal: 5,
    marginTop: -7,
  },
  contactHint: {
    color: MUTED,
    fontSize: 10,
    marginTop: 10,
    marginBottom: 4,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#edf1ee',
    gap: 10,
  },
  contactAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#eaf7f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInitials: {
    color: GREEN,
    fontWeight: '900',
  },
  contactName: {
    color: DARK,
    fontSize: 12,
    fontWeight: '800',
  },
  contactEmail: {
    color: MUTED,
    fontSize: 10,
    marginTop: 3,
  },
  addContact: {
    color: GREEN,
    fontSize: 11,
    fontWeight: '800',
  },
  addedContact: {
    color: '#fff',
    backgroundColor: GREEN,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    overflow: 'hidden',
  },
  fareSummary: {
    backgroundColor: '#f5f8f6',
    borderRadius: 11,
    padding: 12,
    marginVertical: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 5,
  },
  summaryLabel: {
    color: MUTED,
    fontSize: 11,
  },
  summaryValue: {
    color: DARK,
    fontSize: 12,
    fontWeight: '800',
  },
  shareValue: {
    color: GREEN,
    fontSize: 12,
    fontWeight: '900',
  },
  menuSheet: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 17,
    marginBottom: 20,
  },
  menuSheetTitle: {
    color: DARK,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 12,
  },
  walletBalance: {
    backgroundColor: '#10251b',
    borderRadius: 13,
    padding: 14,
    marginBottom: 8,
  },
  balanceLabel: {
    color: '#c4d7cb',
    fontSize: 10,
  },
  balanceAmount: {
    color: '#fff',
    fontSize: 21,
    fontWeight: '900',
    marginTop: 5,
  },
  menuRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#edf1ee',
  },
  menuRowText: {
    color: DARK,
    fontSize: 13,
    fontWeight: '700',
  },
});
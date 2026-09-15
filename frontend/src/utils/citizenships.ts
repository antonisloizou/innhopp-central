type CitizenshipOption = {
  code: string;
  name: string;
};

// ISO 3166-1 regions provide a consistent set of citizenship values while
// keeping existing free-form values readable in the profile form.
const citizenships: CitizenshipOption[] = [
  ['AF', 'Afghanistan'], ['AL', 'Albania'], ['DZ', 'Algeria'], ['AD', 'Andorra'], ['AO', 'Angola'], ['AG', 'Antigua and Barbuda'], ['AR', 'Argentina'], ['AM', 'Armenia'], ['AU', 'Australia'], ['AT', 'Austria'], ['AZ', 'Azerbaijan'],
  ['BS', 'Bahamas'], ['BH', 'Bahrain'], ['BD', 'Bangladesh'], ['BB', 'Barbados'], ['BY', 'Belarus'], ['BE', 'Belgium'], ['BZ', 'Belize'], ['BJ', 'Benin'], ['BT', 'Bhutan'], ['BO', 'Bolivia'], ['BA', 'Bosnia and Herzegovina'], ['BW', 'Botswana'], ['BR', 'Brazil'], ['BN', 'Brunei'], ['BG', 'Bulgaria'], ['BF', 'Burkina Faso'], ['BI', 'Burundi'],
  ['CV', 'Cabo Verde'], ['KH', 'Cambodia'], ['CM', 'Cameroon'], ['CA', 'Canada'], ['CF', 'Central African Republic'], ['TD', 'Chad'], ['CL', 'Chile'], ['CN', 'China'], ['CO', 'Colombia'], ['KM', 'Comoros'], ['CG', 'Congo'], ['CD', 'Congo, Democratic Republic of the'], ['CR', 'Costa Rica'], ['CI', "Côte d’Ivoire"], ['HR', 'Croatia'], ['CU', 'Cuba'], ['CY', 'Cyprus'], ['CZ', 'Czechia'],
  ['DK', 'Denmark'], ['DJ', 'Djibouti'], ['DM', 'Dominica'], ['DO', 'Dominican Republic'],
  ['EC', 'Ecuador'], ['EG', 'Egypt'], ['SV', 'El Salvador'], ['GQ', 'Equatorial Guinea'], ['ER', 'Eritrea'], ['EE', 'Estonia'], ['SZ', 'Eswatini'], ['ET', 'Ethiopia'],
  ['FJ', 'Fiji'], ['FI', 'Finland'], ['FR', 'France'],
  ['GA', 'Gabon'], ['GM', 'Gambia'], ['GE', 'Georgia'], ['DE', 'Germany'], ['GH', 'Ghana'], ['GR', 'Greece'], ['GD', 'Grenada'], ['GT', 'Guatemala'], ['GN', 'Guinea'], ['GW', 'Guinea-Bissau'], ['GY', 'Guyana'],
  ['HT', 'Haiti'], ['HN', 'Honduras'], ['HU', 'Hungary'],
  ['IS', 'Iceland'], ['IN', 'India'], ['ID', 'Indonesia'], ['IR', 'Iran'], ['IQ', 'Iraq'], ['IE', 'Ireland'], ['IL', 'Israel'], ['IT', 'Italy'],
  ['JM', 'Jamaica'], ['JP', 'Japan'], ['JO', 'Jordan'],
  ['KZ', 'Kazakhstan'], ['KE', 'Kenya'], ['KI', 'Kiribati'], ['KP', 'Korea, North'], ['KR', 'Korea, South'], ['KW', 'Kuwait'], ['KG', 'Kyrgyzstan'],
  ['LA', 'Laos'], ['LV', 'Latvia'], ['LB', 'Lebanon'], ['LS', 'Lesotho'], ['LR', 'Liberia'], ['LY', 'Libya'], ['LI', 'Liechtenstein'], ['LT', 'Lithuania'], ['LU', 'Luxembourg'],
  ['MG', 'Madagascar'], ['MW', 'Malawi'], ['MY', 'Malaysia'], ['MV', 'Maldives'], ['ML', 'Mali'], ['MT', 'Malta'], ['MH', 'Marshall Islands'], ['MR', 'Mauritania'], ['MU', 'Mauritius'], ['MX', 'Mexico'], ['FM', 'Micronesia'], ['MD', 'Moldova'], ['MC', 'Monaco'], ['MN', 'Mongolia'], ['ME', 'Montenegro'], ['MA', 'Morocco'], ['MZ', 'Mozambique'], ['MM', 'Myanmar'],
  ['NA', 'Namibia'], ['NR', 'Nauru'], ['NP', 'Nepal'], ['NL', 'Netherlands'], ['NZ', 'New Zealand'], ['NI', 'Nicaragua'], ['NE', 'Niger'], ['NG', 'Nigeria'], ['MK', 'North Macedonia'], ['NO', 'Norway'],
  ['OM', 'Oman'],
  ['PK', 'Pakistan'], ['PW', 'Palau'], ['PS', 'Palestine'], ['PA', 'Panama'], ['PG', 'Papua New Guinea'], ['PY', 'Paraguay'], ['PE', 'Peru'], ['PH', 'Philippines'], ['PL', 'Poland'], ['PT', 'Portugal'],
  ['QA', 'Qatar'],
  ['RO', 'Romania'], ['RU', 'Russia'], ['RW', 'Rwanda'],
  ['KN', 'Saint Kitts and Nevis'], ['LC', 'Saint Lucia'], ['VC', 'Saint Vincent and the Grenadines'], ['WS', 'Samoa'], ['SM', 'San Marino'], ['ST', 'São Tomé and Príncipe'], ['SA', 'Saudi Arabia'], ['SN', 'Senegal'], ['RS', 'Serbia'], ['SC', 'Seychelles'], ['SL', 'Sierra Leone'], ['SG', 'Singapore'], ['SK', 'Slovakia'], ['SI', 'Slovenia'], ['SB', 'Solomon Islands'], ['SO', 'Somalia'], ['ZA', 'South Africa'], ['SS', 'South Sudan'], ['ES', 'Spain'], ['LK', 'Sri Lanka'], ['SD', 'Sudan'], ['SR', 'Suriname'], ['SE', 'Sweden'], ['CH', 'Switzerland'], ['SY', 'Syria'],
  ['TW', 'Taiwan'], ['TJ', 'Tajikistan'], ['TZ', 'Tanzania'], ['TH', 'Thailand'], ['TL', 'Timor-Leste'], ['TG', 'Togo'], ['TO', 'Tonga'], ['TT', 'Trinidad and Tobago'], ['TN', 'Tunisia'], ['TR', 'Türkiye'], ['TM', 'Turkmenistan'], ['TV', 'Tuvalu'],
  ['UG', 'Uganda'], ['UA', 'Ukraine'], ['AE', 'United Arab Emirates'], ['GB', 'United Kingdom'], ['US', 'United States'], ['UY', 'Uruguay'], ['UZ', 'Uzbekistan'],
  ['VU', 'Vanuatu'], ['VA', 'Vatican City'], ['VE', 'Venezuela'], ['VN', 'Vietnam'],
  ['YE', 'Yemen'],
  ['ZM', 'Zambia'], ['ZW', 'Zimbabwe'], ['XK', 'Kosovo']
].map(([code, name]) => ({ code, name }));

export const citizenshipOptions = citizenships.sort((a, b) => a.name.localeCompare(b.name));

export const citizenshipLabel = (value: string) =>
  citizenshipOptions.find((option) => option.code === value)?.name || value;

const normaliseCountryValue = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const countryByCode = new Map(citizenshipOptions.map((country) => [country.code, country]));
const countryByName = new Map(citizenshipOptions.map((country) => [normaliseCountryValue(country.name), country]));

// Older profiles use free text, so retain the common ways people write a
// nationality rather than treating each spelling as a separate country.
const countryAliases: Record<string, string> = {
  america: 'US', american: 'US', 'u s': 'US', 'u s citizen': 'US', 'u s citizen of america': 'US', 'united states of america': 'US', usa: 'US', us: 'US',
  britain: 'GB', british: 'GB', 'great britain': 'GB', uk: 'GB', england: 'GB', scotland: 'GB', wales: 'GB',
  'czech republic': 'CZ', czech: 'CZ', belgian: 'BE', belgie: 'BE', swiss: 'CH', svizzera: 'CH', turkish: 'TR', canadian: 'CA',
  australian: 'AU', austrian: 'AT', brazilian: 'BR', lebanese: 'LB', mexican: 'MX',
  norwegian: 'NO', norsk: 'NO', swedish: 'SE', danish: 'DK', finnish: 'FI', german: 'DE', french: 'FR', italian: 'IT', spanish: 'ES', portuguese: 'PT', polish: 'PL', greek: 'GR', cypriot: 'CY',
  dutch: 'NL', holland: 'NL', 'the netherlands': 'NL',
  'republic of ireland': 'IE', irish: 'IE', 'south korean': 'KR', 'south korea': 'KR', 'north korea': 'KP',
  'united arab emirates': 'AE', uae: 'AE',
  russia: 'RU', russian: 'RU', turkey: 'TR', turkiye: 'TR',
  'ivory coast': 'CI', 'cape verde': 'CV', 'vatican': 'VA',
  'moldova republic': 'MD', 'bolivia plurinational state of': 'BO',
  'venezuela bolivarian republic of': 'VE', 'palestinian territories': 'PS'
};

const aliasEntries = Object.entries(countryAliases)
  .sort(([left], [right]) => right.length - left.length);
const countryNameEntries = [...countryByName.entries()]
  .sort(([left], [right]) => right.length - left.length);

export type ParsedCountry = {
  code?: string;
  name: string;
  key: string;
};

export const parseCitizenshipCountry = (value?: string | null): ParsedCountry => {
  const raw = value?.trim();
  if (!raw) return { name: 'N/A', key: 'n/a' };

  const normalized = normaliseCountryValue(raw);
  const directCode = normalized.length === 2 ? countryByCode.get(normalized.toUpperCase()) : undefined;
  const directName = countryByName.get(normalized);
  const aliasCode = countryAliases[normalized];
  const direct = directCode || directName || (aliasCode ? countryByCode.get(aliasCode) : undefined);
  if (direct) return { code: direct.code, name: direct.name, key: direct.code };

  // Accommodate entries such as "Nationality: Norwegian", "From Norway",
  // and "Norway (NO)" without guessing when no known country is present.
  const stripped = normalized.replace(/^(nationality|citizenship|country|from|citizen of)\s+/, '');
  const candidates = [stripped, normalized];
  for (const candidate of candidates) {
    for (const [alias, code] of aliasEntries) {
      if (candidate === alias || candidate.includes(` ${alias} `) || candidate.startsWith(`${alias} `) || candidate.endsWith(` ${alias}`)) {
        const country = countryByCode.get(code);
        if (country) return { code: country.code, name: country.name, key: country.code };
      }
    }
    for (const [name, country] of countryNameEntries) {
      if (candidate === name || candidate.includes(` ${name} `) || candidate.startsWith(`${name} `) || candidate.endsWith(` ${name}`)) {
        return { code: country.code, name: country.name, key: country.code };
      }
    }
  }

  return { name: raw, key: `freeform:${normalized}` };
};

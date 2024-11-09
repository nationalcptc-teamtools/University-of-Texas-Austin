cwe_url = 'https://cwe.mitre.org/data/definitions/{}.html'

import csv
from itertools import islice
import yaml
import xml.etree.ElementTree as ET

# this will sometimes crash because some of the data is LITERALLY WRONG
def parse_colonstring(s):
    a = s.split('::')[1:-1]
    r = []
    for e in a:
        e = e.split(':')
        d = {}
        for k, v in zip(islice(e, 0, None, 2), islice(e, 1, None, 2)):
            d[k] = v
        r.append(d)
    return r

# don't even ask
acceptable = ['Operation', 'Build and Compilation', 'Installation', 'System Configuration', 'Implementation', 'Architecture and Design']
def remed_is_acceptable(r):
    for poss in acceptable:
        if poss in r:
            return True
    return False

def insertbrs(s: str):
    return s.replace('\r', '').replace('\n', '<br>')

def wrapp(s: str):
    return '<p>' + insertbrs(s) + '</p>'

def get_remediations(p):
    if not p:
        return None
    r = []
    for q in parse_colonstring(p):
        #print(p)
        #print(q)
        if q and remed_is_acceptable(q['PHASE']) and q['DESCRIPTION']:
            r.append(wrapp(q['PHASE'] + ': ' + q['DESCRIPTION']))
    return '\n'.join(r)

with open('699.csv', newline='') as csvfile, open('699.xml') as garbage, open("vulns.yml", 'w') as outfile:
    p = {}
    reader = csv.DictReader(csvfile)
    for row in reader:
        d = {}
        d['references'] = [cwe_url.format(row['CWE-ID'])]
        d['cvssv3'] = None # can't really figure this out from this data
        d['cvssScore'] = 0
        d['cvssSeverity'] = "Low"
        d['priority'] = 2
        d['remediationComplexity'] = 2 # or this
        dt = {}
        dt['locale'] = 'en-US'
        dt['title'] = row['Name']
        dt['vulnType'] = None
        dt['description'] = wrapp(row['Description']) + wrapp(row['Extended Description'])
        dt['observation'] = None
        dt['remediation'] = get_remediations(row['Potential Mitigations'])
        d['details'] = [dt]
        p[row['CWE-ID']] = d

    # I was really hope I was going to be able to do this without parsing xml
    tree = ET.parse(garbage)
    root = tree.getroot()
    # print(list(p.keys())[0])
    categories = root.find('{http://cwe.mitre.org/cwe-7}Categories')
    for category in categories: # type: ignore
        name = category.attrib['Name']
        for has in category.find('{http://cwe.mitre.org/cwe-7}Relationships').findall('{http://cwe.mitre.org/cwe-7}Has_Member'): # type: ignore
            p[has.attrib['CWE_ID']]['details'][0]['vulnType'] = name
    yaml.dump(list(p.values()), outfile)
